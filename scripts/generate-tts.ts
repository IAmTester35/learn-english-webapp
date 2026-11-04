import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateAudioBytesWithKeyRotation,
  saveAudioBytes,
  getShortestCooldownRemainingMs,
  resetKeyCooldowns,
  isFfmpegAvailable,
} from '../src/server/ttsService';
import {
  parseTranscriptDialogue,
  resolveSpeakerProfiles,
} from '../src/services/listeningTtsCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT_DIR, 'public', 'tests');
const AUDIO_DIR = path.join(TESTS_DIR, 'audio');
const TEMP_MD_PATH = path.join(ROOT_DIR, 'temp.md');
const HEALTH_FILE_PATH = path.join(ROOT_DIR, '.gemini_key_health.json');

const HAS_FFMPEG = isFfmpegAvailable();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface KeyHealthRecord {
  downCount: number;
  lastDownAt?: string;
  lastDownReason?: string;
  totalSuccesses: number;
}

function loadHealthRecords(): Record<string, KeyHealthRecord> {
  if (fs.existsSync(HEALTH_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(HEALTH_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function saveHealthRecords(records: Record<string, KeyHealthRecord>): void {
  try {
    fs.writeFileSync(HEALTH_FILE_PATH, JSON.stringify(records, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error('Không thể lưu file lịch sử sức khỏe key:', err);
  }
}

export interface ActiveKey {
  envVarName: string;
  apiKey: string;
  keyShort: string;
}

function loadActiveKeys(): ActiveKey[] {
  const envMap: Record<string, string> = {};
  const envFiles = [
    path.join(ROOT_DIR, '.env'),
    path.join(ROOT_DIR, '.env.local'),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed
          .slice(eqIdx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        envMap[key] = val;
      }
    }
  }

  const merged: Record<string, string | undefined> = { ...envMap, ...process.env };
  const activeKeys: ActiveKey[] = [];
  const seenValues = new Set<string>();

  for (const [key, value] of Object.entries(merged)) {
    if (/^GEMINI_API_KEY(_\w+)?$/i.test(key) && typeof value === 'string') {
      const trimmedVal = value.trim();
      if (
        trimmedVal.length > 0 &&
        !trimmedVal.toLowerCase().startsWith('your_gemini_api_key') &&
        !seenValues.has(trimmedVal)
      ) {
        seenValues.add(trimmedVal);
        activeKeys.push({
          envVarName: key,
          apiKey: trimmedVal,
          keyShort: trimmedVal.slice(0, 6) + '...' + trimmedVal.slice(-4),
        });
      }
    }
  }

  activeKeys.sort((a, b) => a.envVarName.localeCompare(b.envVarName, undefined, { numeric: true }));
  return activeKeys;
}

interface ListeningPartJson {
  id: string;
  title: string;
  audioUrl?: string;
  transcript?: string;
  audioConfig?: import('../src/types/test').ListeningAudioConfig;
  speakers?: import('../src/types/test').SpeakerConfig[];
}

interface TestJson {
  id: string;
  sections?: {
    listening?: {
      parts?: ListeningPartJson[];
    };
  };
}

interface TtsTask {
  id: string;
  file: string;
  filePath: string;
  fileBase: string;
  part: ListeningPartJson;
  audioDiskPath: string;
  publicAudioUrl: string;
  taskLabel: string;
}

// Mutex để cập nhật atomic cho từng file JSON
const fileMutexMap = new Map<string, Promise<void>>();

async function updateTestJsonWithAudioUrl(
  filePath: string,
  partId: string,
  publicAudioUrl: string
): Promise<void> {
  const prevLock = fileMutexMap.get(filePath) || Promise.resolve();
  let releaseLock: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  fileMutexMap.set(filePath, currentLock);

  await prevLock;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const doc = JSON.parse(raw) as TestJson;
    const parts = doc.sections?.listening?.parts || [];
    const targetPart = parts.find((p) => p.id === partId);
    if (targetPart) {
      targetPart.audioUrl = publicAudioUrl;
      fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
    }
  } finally {
    releaseLock!();
  }
}

function generateTempMarkdown(failedList: { task: TtsTask; error: Error }[]): string {
  const sections = failedList.map(({ task, error }, idx) => {
    const part = task.part;
    const { speakers, turns } = parseTranscriptDialogue(part.transcript || '');
    const profiles = resolveSpeakerProfiles(speakers, part.speakers);
    const audioConfig = part.audioConfig;

    const speakerInfo = profiles
      .map(
        (p) =>
          `- **${p.name}** (${p.gender.toUpperCase()}): Giọng đề xuất \`${p.voiceName}\`${
            p.style ? ` | Phong thái: *${p.style}*` : ''
          }`
      )
      .join('\n');

    const formattedConversation = turns
      .map((t) => {
        const prof = profiles.find((p) => p.name.toLowerCase() === t.speaker.toLowerCase());
        const voiceTag = prof ? `[${prof.voiceName}] ` : '';
        return `${voiceTag}${t.speaker}: ${t.text}`;
      })
      .join('\n\n');

    return `## ${idx + 1}. Đề thi: \`${task.file}\` | Phần: \`${part.id}\` (${part.title})

- **Lỗi gặp phải**: ${error.message}
- **File đích cần lưu**: \`${task.audioDiskPath}\`
- **Đường dẫn web**: \`${task.publicAudioUrl}\`
- **Nhịp điệu (Pacing)**: \`${audioConfig?.pacing || 'exam_standard'}\`
- **Ngữ cảnh & Chất giọng**: \`${audioConfig?.scenario || 'dialogue'}\` | \`${audioConfig?.accent || 'british'}\`${
      audioConfig?.overallStyle ? ` (${audioConfig.overallStyle})` : ''
    }

### Nhân vật & Giọng đọc (Google Gemini Prebuilt Voices):
${speakerInfo || '- Không có thông tin nhân vật cụ thể (Single Speaker)'}

### Kịch bản hội thoại để Copy vào AI Studio / TTS Tool:

\`\`\`text
${formattedConversation}
\`\`\`

### Transcript thô (Raw Transcript):

\`\`\`text
${part.transcript?.trim() || ''}
\`\`\`

---
`;
  });

  return `# Danh Sách Các Phần Nghe Chưa Tạo Được Audio (Rate Limit / Timeout)

> Tài liệu này được tạo tự động khi các API key gặp sự cố kéo dài hoặc tiến trình dừng sớm.
> Bạn có thể sao chép kịch bản bên dưới để tạo audio thủ công qua Google AI Studio / TTS Tool rồi lưu file vào đúng **File đích cần lưu**.

**Tổng số phần chưa hoàn thành**: ${failedList.length}

---

${sections.join('\n')}
`;
}

/**
 * Worker luân chuyển key tức thì (Zero-Wait Key Rotation Worker):
 * Không bao giờ sleep 1m/3m trên 1 key!
 * Tự động chuyển key ngay lập tức (0ms delay) qua engine ttsService.
 */
async function runRotationWorker(
  workerId: number,
  taskQueue: TtsTask[],
  inFlightSet: Set<string>,
  failedTasksMap: Map<string, { task: TtsTask; error: Error }>,
  healthRecords: Record<string, KeyHealthRecord>,
  onSuccess: (task: TtsTask, byteLength: number, webUrl: string) => void,
  isStoppingRef: { current: boolean }
): Promise<void> {
  while (!isStoppingRef.current) {
    const task = taskQueue.shift();
    if (!task) {
      break;
    }

    inFlightSet.add(task.id);
    console.log(`  [Worker ${workerId}] 🎙️ Bắt đầu xử lý: ${task.taskLabel} - ${task.part.title}`);

    let succeeded = false;

    // Vòng lặp xử lý task (nếu tất cả key đều cooldown, đợi key sớm nhất hạ nhiệt rồi thử tiếp)
    for (let loopAttempt = 0; loopAttempt < 3; loopAttempt++) {
      if (isStoppingRef.current) {
        taskQueue.unshift(task);
        inFlightSet.delete(task.id);
        return;
      }

      try {
        // Timeout 45s + Zero-wait Failover qua pool keys
        const wavBytes = await generateAudioBytesWithKeyRotation(
          task.part.transcript || '',
          task.part.audioConfig,
          task.part.speakers
        );

        const saved = saveAudioBytes(`${task.fileBase}-${task.part.id}`, wavBytes);
        await updateTestJsonWithAudioUrl(task.filePath, task.part.id, saved.webUrl);

        inFlightSet.delete(task.id);
        failedTasksMap.delete(task.id);
        succeeded = true;
        const rec = healthRecords[task.fileBase] || { downCount: 0, totalSuccesses: 0 };
        rec.totalSuccesses += 1;
        healthRecords[task.fileBase] = rec;
        saveHealthRecords(healthRecords);

        onSuccess(task, saved.byteLength, saved.webUrl);
        break;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        const waitMs = getShortestCooldownRemainingMs();

        if (waitMs > 0 && loopAttempt < 2 && !isStoppingRef.current) {
          const waitSec = Math.ceil(waitMs / 1000);
          console.warn(
            `  ⏳ [Worker ${workerId}] Tất cả keys đang trong cooldown. Đợi ${waitSec}s cho key kế tiếp sẵn sàng...`
          );
          let elapsed = 0;
          const step = 1000;
          while (elapsed < waitMs && !isStoppingRef.current) {
            await sleep(Math.min(step, waitMs - elapsed));
            elapsed += step;
          }
          continue;
        }

        // Đã thử qua hết lượt và vẫn không thể hoàn thành
        console.error(`  ❌ [Worker ${workerId}] Thất bại cho task ${task.taskLabel}: ${error.message}`);
        inFlightSet.delete(task.id);
        failedTasksMap.set(task.id, { task, error });
        break;
      }
    }

    if (!succeeded) {
      inFlightSet.delete(task.id);
    }
  }
}

async function main() {
  const force = process.argv.includes('--force');

  // Đặt lại lịch sử sức khỏe và cooldown
  if (process.argv.includes('--reset-health')) {
    if (fs.existsSync(HEALTH_FILE_PATH)) {
      try {
        fs.unlinkSync(HEALTH_FILE_PATH);
      } catch {}
    }
    resetKeyCooldowns();
    console.log('🔄 Đã đặt lại toàn bộ lịch sử sức khỏe API key và xóa sạch Cooldown Cache.');
  }

  const activeKeys = loadActiveKeys();
  if (activeKeys.length === 0) {
    console.error(
      '❌ Không tìm thấy API key hợp lệ nào trong file .env (hoặc tất cả keys đã bị comment out).'
    );
    process.exit(1);
  }

  const healthRecords = loadHealthRecords();
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const files = fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json');

  const taskQueue: TtsTask[] = [];

  for (const file of files) {
    const filePath = path.join(TESTS_DIR, file);
    const fileBase = path.basename(file, '.json');
    const rawJson = fs.readFileSync(filePath, 'utf-8');
    const doc = JSON.parse(rawJson) as TestJson;
    const parts = doc.sections?.listening?.parts || [];

    for (const part of parts) {
      if (!part.transcript?.trim()) {
        continue;
      }

      const audioExt = HAS_FFMPEG ? 'mp3' : 'wav';
      const audioFileName = `${fileBase}-${part.id}.${audioExt}`;
      const audioDiskPath = path.join(AUDIO_DIR, audioFileName);
      const publicAudioUrl = `/tests/audio/${audioFileName}`;

      const mp3Path = path.join(AUDIO_DIR, `${fileBase}-${part.id}.mp3`);
      const wavPath = path.join(AUDIO_DIR, `${fileBase}-${part.id}.wav`);
      const existingDiskPath = fs.existsSync(mp3Path)
        ? mp3Path
        : fs.existsSync(wavPath)
        ? wavPath
        : undefined;
      const fileExists = existingDiskPath && fs.statSync(existingDiskPath).size > 44;

      if (fileExists && !force) {
        const existingPublicUrl = `/tests/audio/${path.basename(existingDiskPath!)}`;
        if (part.audioUrl !== existingPublicUrl) {
          await updateTestJsonWithAudioUrl(filePath, part.id, existingPublicUrl);
        }
        continue;
      }

      taskQueue.push({
        id: `${fileBase}/${part.id}`,
        file,
        filePath,
        fileBase,
        part,
        audioDiskPath,
        publicAudioUrl,
        taskLabel: `${fileBase}/${part.id}`,
      });
    }
  }

  if (taskQueue.length === 0) {
    console.log('✅ Tất cả file âm thanh Listening đã sẵn sàng. Dùng --force nếu muốn tạo lại toàn bộ.');
    if (fs.existsSync(TEMP_MD_PATH)) {
      try {
        fs.unlinkSync(TEMP_MD_PATH);
      } catch {}
    }
    return;
  }

  const totalTasks = taskQueue.length;
  // Số worker chạy song song (tối ưu 2-3 workers đồng thời để tránh tràn Quota quá nhanh)
  const workerCount = Math.max(1, Math.min(activeKeys.length, 3));

  console.log(`\n🎙️  Bắt đầu tiến trình tạo TTS (Timeout 45s + Zero-Wait Key Rotation)...`);
  console.log(`⚡ Số Workers khởi tạo: ${workerCount} luồng song song`);
  console.log(`🔑 Pool API Keys khả dụng: ${activeKeys.length} keys (${activeKeys.map((k) => k.envVarName).join(', ')})`);
  console.log(`📦 Tổng số phần nghe cần xử lý: ${totalTasks}`);
  console.log(`⏱️  Chính sách Timeout: 45 giây/cuộc gọi (hủy bỏ treo API)`);
  console.log(`🚀 Chính sách Failover: ZERO-WAIT (0ms delay khi gặp 429/Timeout, không sleep 1m/3m trên 1 key!)`);
  console.log(`💾 Cơ chế lưu: Incremental Save (Ghi đĩa MP3 192k 24kHz & cập nhật JSON ngay sau mỗi part)\n`);

  const inFlightSet = new Set<string>();
  const failedTasksMap = new Map<string, { task: TtsTask; error: Error }>();
  let completedCount = 0;
  const isStoppingRef = { current: false };

  const handleShutdown = () => {
    if (isStoppingRef.current) {
      console.log('\nĐang cưỡng chế dừng tiến trình...');
      process.exit(1);
    }
    console.log('\n🛑 Nhận tín hiệu dừng (Ctrl+C). Đang dừng các workers và bảo toàn dữ liệu...');
    isStoppingRef.current = true;
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  const workerPromises = Array.from({ length: workerCount }, (_, idx) =>
    runRotationWorker(
      idx + 1,
      taskQueue,
      inFlightSet,
      failedTasksMap,
      healthRecords,
      (task, byteLength, webUrl) => {
        completedCount++;
        console.log(
          `  ✅ [ĐÃ XONG ${completedCount}/${totalTasks}] Lưu: ${webUrl} (${(byteLength / 1024).toFixed(1)} KB)`
        );
      },
      isStoppingRef
    )
  );

  await Promise.all(workerPromises);

  // Gom các task còn lại nếu bị dừng sớm
  while (taskQueue.length > 0) {
    const remaining = taskQueue.shift();
    if (remaining && !failedTasksMap.has(remaining.id)) {
      failedTasksMap.set(remaining.id, {
        task: remaining,
        error: new Error(
          isStoppingRef.current
            ? 'Tiến trình dừng bởi người dùng (SIGINT)'
            : 'Tất cả API keys đều đã cạn kiệt Quota hoặc gặp sự cố'
        ),
      });
    }
  }

  // Xử lý báo cáo temp.md
  if (failedTasksMap.size > 0) {
    const failedList = Array.from(failedTasksMap.values());
    const mdContent = generateTempMarkdown(failedList);
    fs.writeFileSync(TEMP_MD_PATH, mdContent, 'utf-8');
    console.warn(`\n⚠️  Có ${failedList.length}/${totalTasks} phần thi chưa hoàn tất.`);
    console.warn(`📝 Đã xuất toàn bộ kịch bản, nhân vật, nhịp điệu vào: temp.md`);
    console.warn(`👉 Bạn có thể mở temp.md để copy kịch bản làm thủ công hoặc chạy lại khi các key hồi phục!`);
  } else {
    if (fs.existsSync(TEMP_MD_PATH)) {
      try {
        fs.unlinkSync(TEMP_MD_PATH);
      } catch {}
    }
    console.log(`\n🎉 Xuất sắc! Đã hoàn tất 100% (${completedCount}/${totalTasks}) file âm thanh Listening!`);
  }
}

main().catch((err) => {
  console.error('❌ Lỗi tiến trình tạo TTS:', err);
  process.exit(1);
});
