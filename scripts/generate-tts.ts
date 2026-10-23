import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import {
  buildListeningTtsRequest,
  combineAudioPartsToWavBytes,
  parseTranscriptDialogue,
  resolveSpeakerProfiles,
} from '../src/services/listeningTtsCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const TESTS_DIR = path.join(ROOT_DIR, 'public', 'tests');
const AUDIO_DIR = path.join(TESTS_DIR, 'audio');
const TEMP_MD_PATH = path.join(ROOT_DIR, 'temp.md');
const HEALTH_FILE_PATH = path.join(ROOT_DIR, '.gemini_key_health.json');
const ARCHIVE_AUDIO_DIR = path.join(ROOT_DIR, 'archive', 'audio');

const HAS_FFMPEG = (() => {
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
})();

function saveAudioBytes(rawWavBytes: Uint8Array, outputPath: string): void {
  // Tự động sao lưu bản WAV raw vào thư mục archive/audio/ cục bộ
  try {
    fs.mkdirSync(ARCHIVE_AUDIO_DIR, { recursive: true });
    const wavArchiveName = path.basename(outputPath).replace(/\.mp3$/i, '.wav');
    fs.writeFileSync(path.join(ARCHIVE_AUDIO_DIR, wavArchiveName), rawWavBytes);
  } catch {
    // Không làm gián đoạn nếu ghi archive gặp lỗi
  }

  if (outputPath.endsWith('.mp3') && HAS_FFMPEG) {
    const tempWav = outputPath + '.tmp.wav';
    fs.writeFileSync(tempWav, rawWavBytes);
    const proc = spawnSync('ffmpeg', ['-y', '-i', tempWav, '-b:a', '96k', '-ar', '24000', outputPath], {
      stdio: 'ignore',
    });
    try {
      fs.unlinkSync(tempWav);
    } catch {
      // ignore
    }
    if (proc.status === 0 && fs.existsSync(outputPath)) {
      return;
    }
  }
  fs.writeFileSync(outputPath, rawWavBytes);
}

// Rate limit & Retry Configuration
// Đã loại bỏ hoàn toàn thời gian chờ 5 phút: chỉ thử 1m (lần 1) và 3m (lần 2).
const MAX_RETRIES_PER_KEY = 2;
const RETRY_BASE_DELAYS_MS = [
  1 * 60 * 1000, // Lần 1: 1 phút
  3 * 60 * 1000, // Lần 2: 3 phút
];

// Ngưỡng số lần bị down liên tiếp để tự động comment out key trong file .env
const DOWN_THRESHOLD_TO_COMMENT_OUT = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateJitterDelay(attemptIndex: number): number {
  const baseMs = RETRY_BASE_DELAYS_MS[attemptIndex] ?? 3 * 60 * 1000;
  // Jitter: dao động ngẫu nhiên 0 đến 15s để chống thundering herd
  const jitterMs = Math.floor(Math.random() * 15_000);
  return baseMs + jitterMs;
}

function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; code?: number; statusCode?: number; message?: string };
  if (anyErr.status === 429 || anyErr.code === 429 || anyErr.statusCode === 429) {
    return true;
  }
  const msg = (anyErr.message || String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('too many requests')
  );
}

function isFatalError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; code?: number; statusCode?: number; message?: string };
  if (anyErr.status === 400 || anyErr.status === 401 || anyErr.status === 403) {
    return true;
  }
  const msg = (anyErr.message || String(err)).toLowerCase();
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('permission_denied') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid argument')
  );
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

function commentOutKeyInEnv(envVarName: string, reason: string): boolean {
  if (!fs.existsSync(ENV_PATH)) return false;

  const rawContent = fs.readFileSync(ENV_PATH, 'utf-8');
  const lines = rawContent.split(/\r?\n/);
  let modified = false;

  const updatedLines: string[] = [];
  const regex = new RegExp(`^(\\s*${envVarName}\\s*=.*)$`);

  for (const line of lines) {
    if (regex.test(line)) {
      modified = true;
      const timestamp = new Date().toISOString();
      updatedLines.push(
        `# [VÔ HIỆU HÓA TỰ ĐỘNG - ${timestamp}]`,
        `# Lý do: ${reason}`,
        `# Bỏ dấu comment '#' dòng dưới khi key đã được mở lại Quota:`,
        `# ${line.trim()}`
      );
    } else {
      updatedLines.push(line);
    }
  }

  if (modified) {
    fs.writeFileSync(ENV_PATH, updatedLines.join('\n') + '\n', 'utf-8');
    console.warn(`\n🚨 [ENV UPDATE] Đã tự động comment out \`${envVarName}\` trong file .env!`);
    console.warn(`   Lý do: ${reason}\n`);
  }

  return modified;
}

export interface ActiveKey {
  envVarName: string; // e.g. "GEMINI_API_KEY_1"
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
        // Bỏ qua dòng comment (#) hoặc dòng rỗng
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

  // Merge process.env with envMap from files
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

  // Sắp xếp thứ tự tự nhiên (GEMINI_API_KEY_1, GEMINI_API_KEY_2...)
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
  id: string; // e.g. "b2-upper-intermediate/l-p1"
  file: string;
  filePath: string;
  fileBase: string;
  part: ListeningPartJson;
  audioDiskPath: string;
  publicAudioUrl: string;
  taskLabel: string;
  lastError?: string;
}

// Per-file Mutex to ensure thread-safe atomic updates to JSON test documents
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
          `- **${p.name}** (${p.gender.toUpperCase()}): Giọng đề xuất \`${p.voiceName}\`${p.style ? ` | Phong thái: *${p.style}*` : ''}`
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
- **Ngữ cảnh & Chất giọng**: \`${audioConfig?.scenario || 'dialogue'}\` | \`${audioConfig?.accent || 'british'}\`${audioConfig?.overallStyle ? ` (${audioConfig.overallStyle})` : ''}

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

  return `# Danh Sách Các Phần Nghe Chưa Tạo Được Audio (Rate Limit)

> Tài liệu này được tạo tự động khi các API key gặp Rate Limit kéo dài hoặc khi tiến trình dừng.
> Bạn có thể sao chép kịch bản bên dưới để tạo audio thủ công qua Google AI Studio / TTS Tool rồi lưu file vào đúng **File đích cần lưu**.

**Tổng số phần chưa hoàn thành**: ${failedList.length}

---

${sections.join('\n')}
`;
}

// Dedicated Worker Thread: 1 Worker assigned 100% to 1 Gemini API Key
async function runDedicatedWorker(
  workerId: number,
  keyInfo: ActiveKey,
  taskQueue: TtsTask[],
  inFlightSet: Set<string>,
  failedTasksMap: Map<string, { task: TtsTask; error: Error }>,
  healthRecords: Record<string, KeyHealthRecord>,
  onSuccess: (task: TtsTask, byteLength: number) => void,
  isStoppingRef: { current: boolean }
): Promise<void> {
  const { apiKey, keyShort, envVarName } = keyInfo;
  const client = new GoogleGenAI({ apiKey });

  while (!isStoppingRef.current) {
    const task = taskQueue.shift();
    if (!task) {
      // Hàng đợi rỗng, worker hoàn thành
      break;
    }

    inFlightSet.add(task.id);
    const requestParams = buildListeningTtsRequest({
      transcript: task.part.transcript || '',
      audioConfig: task.part.audioConfig,
      speakers: task.part.speakers,
    });

    let taskSucceeded = false;

    // Retry loop: Tối đa 2 lần thử lại (1m, 3m). KHÔNG có lần chờ 5m.
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_KEY; attempt++) {
      if (isStoppingRef.current) {
        taskQueue.unshift(task);
        inFlightSet.delete(task.id);
        return;
      }

      try {
        console.log(`  [Worker ${workerId} (${envVarName}: ${keyShort})] Đang xử lý: ${task.taskLabel} - ${task.part.title}`);
        const response = await client.models.generateContent(requestParams);
        const parts =
          response.candidates?.[0]?.content?.parts
            ?.map((p) => p.inlineData)
            .filter((d): d is { data: string; mimeType?: string } => Boolean(d?.data)) || [];

        if (parts.length === 0) {
          throw new Error('API không trả về inlineData audio.');
        }

        const { bytes } = combineAudioPartsToWavBytes(parts);

        // Incremental save: Ghi file âm thanh & cập nhật file JSON ngay lập tức
        saveAudioBytes(bytes, task.audioDiskPath);
        await updateTestJsonWithAudioUrl(task.filePath, task.part.id, task.publicAudioUrl);

        inFlightSet.delete(task.id);
        failedTasksMap.delete(task.id);
        taskSucceeded = true;

        // Cập nhật sức khỏe key: ghi nhận thành công
        const rec = healthRecords[envVarName] || { downCount: 0, totalSuccesses: 0 };
        rec.totalSuccesses += 1;
        healthRecords[envVarName] = rec;
        saveHealthRecords(healthRecords);

        onSuccess(task, bytes.byteLength);
        break; // Hoàn thành task thành công
      } catch (err: unknown) {
        // 1. Lỗi Fatal (400, 401, 403): Key chết hẳn, vô hiệu hóa ngay
        if (isFatalError(err)) {
          const reason = `API Key bị lỗi xác thực/quyền (HTTP 401/403): ${(err as Error)?.message || 'Unauthorized'}`;
          console.error(
            `  ❌ [Worker ${workerId} (${envVarName})] ${reason}. DOWN HẲN KEY NÀY!`
          );
          taskQueue.unshift(task);
          inFlightSet.delete(task.id);
          failedTasksMap.set(task.id, {
            task,
            error: err instanceof Error ? err : new Error(String(err)),
          });

          // Tự động comment out ngay trong file .env
          commentOutKeyInEnv(envVarName, reason);
          return; // Worker kết thúc
        }

        // 2. Lỗi Rate Limit (429 / RESOURCE_EXHAUSTED)
        if (isRateLimitError(err)) {
          if (attempt < MAX_RETRIES_PER_KEY) {
            // Lần 1 chờ 1 phút (+ jitter), Lần 2 chờ 3 phút (+ jitter)
            const delayMs = calculateJitterDelay(attempt);
            const minutes = (delayMs / 60000).toFixed(1);
            console.warn(
              `  ⏳ [Worker ${workerId} (${envVarName})] Rate Limit (429). Lần thử lại ${attempt + 1}/${MAX_RETRIES_PER_KEY}: chờ ${minutes} phút (kèm jitter)...`
            );

            // Responsive sleep: kiểm tra isStoppingRef mỗi giây
            const step = 1000;
            let elapsed = 0;
            while (elapsed < delayMs && !isStoppingRef.current) {
              await sleep(Math.min(step, delayMs - elapsed));
              elapsed += step;
            }

            if (isStoppingRef.current) {
              taskQueue.unshift(task);
              inFlightSet.delete(task.id);
              return;
            }
            continue;
          } else {
            // ĐÃ HẾT 2 LẦN THỬ LẠI (sau 1m và 3m mà vẫn 429) -> ĐÁNH GIÁ KEY NÀY RATE LIMIT NẶNG, DOWN HẲN!
            const rec = healthRecords[envVarName] || { downCount: 0, totalSuccesses: 0 };
            rec.downCount += 1;
            rec.lastDownAt = new Date().toISOString();
            rec.lastDownReason = 'Rate limit nặng (thử lại sau 1m và 3m vẫn bị 429)';
            healthRecords[envVarName] = rec;
            saveHealthRecords(healthRecords);

            console.warn(
              `  🛑 [Worker ${workerId} (${envVarName})] Rate Limit nặng kéo dài (hết lượt sau 1m & 3m). DOWN HẲN KEY NÀY, nhường việc lại cho Queue! (Lần down: ${rec.downCount})`
            );

            // Nếu số lần down đạt ngưỡng (>= 2 lần) -> Comment out trong file .env!
            if (rec.downCount >= DOWN_THRESHOLD_TO_COMMENT_OUT) {
              const reason = `Key bị Rate Limit nặng kéo dài (đã chạm ngưỡng ${rec.downCount} lần down liên tiếp)`;
              commentOutKeyInEnv(envVarName, reason);
            }

            taskQueue.unshift(task); // Trả task lại cho các key khác xử lý
            inFlightSet.delete(task.id);
            failedTasksMap.set(task.id, {
              task,
              error: new Error(`Key ${envVarName} bị down do Rate Limit kéo dài`),
            });
            return; // Worker kết thúc! Các worker khác tiếp tục chạy!
          }
        }

        // 3. Transient Network Error: Chờ ngắn 5s
        if (attempt < MAX_RETRIES_PER_KEY) {
          const networkWait = 5000 + Math.floor(Math.random() * 3000);
          console.warn(
            `  ⚠️ [Worker ${workerId} (${envVarName})] Lỗi mạng: ${(err as Error)?.message}. Chờ ${(networkWait / 1000).toFixed(1)}s thử lại...`
          );
          await sleep(networkWait);
          continue;
        }

        // Lỗi khác không thể hồi phục
        taskQueue.unshift(task);
        inFlightSet.delete(task.id);
        failedTasksMap.set(task.id, {
          task,
          error: err instanceof Error ? err : new Error(String(err)),
        });
        return;
      }
    }

    if (!taskSucceeded) {
      inFlightSet.delete(task.id);
    }
  }
}

async function main() {
  const force = process.argv.includes('--force');

  // Option to reset health history if requested
  if (process.argv.includes('--reset-health')) {
    if (fs.existsSync(HEALTH_FILE_PATH)) {
      fs.unlinkSync(HEALTH_FILE_PATH);
      console.log('🔄 Đã đặt lại toàn bộ lịch sử sức khỏe API key.');
    }
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
      } catch {
        // ignore
      }
    }
    return;
  }

  const totalTasks = taskQueue.length;
  console.log(`\n🎙️  Bắt đầu tiến trình tạo TTS (Mô hình Producer-Consumer)...`);
  console.log(`⚡ Số Workers khởi tạo: ${activeKeys.length} luồng (Tương ứng linh động với ${activeKeys.length} API Keys active trong .env)`);
  console.log(`📋 Danh sách Keys: ${activeKeys.map((k) => k.envVarName).join(', ')}`);
  console.log(`📦 Tổng số phần nghe cần xử lý: ${totalTasks}`);
  console.log(`⏳ Chính sách Rate Limit: Chờ 1m (lần 1), 3m (lần 2). LOẠI BỎ hoàn toàn 5m.`);
  console.log(`🛡️  Đánh giá sức khỏe: Key bị 429 sau 3m sẽ DOWN HẲN; nếu down >= ${DOWN_THRESHOLD_TO_COMMENT_OUT} lần sẽ tự động comment out trong .env.`);
  console.log(`💾 Cơ chế lưu: Incremental Save (Ghi đĩa & cập nhật JSON ngay khi xong từng part)\n`);

  const inFlightSet = new Set<string>();
  const failedTasksMap = new Map<string, { task: TtsTask; error: Error }>();
  let completedCount = 0;
  const isStoppingRef = { current: false };

  // Graceful Shutdown on SIGINT / SIGTERM
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

  // Khởi tạo Dedicated Workers (1 worker per API key)
  const workerPromises = activeKeys.map((keyInfo, index) =>
    runDedicatedWorker(
      index + 1,
      keyInfo,
      taskQueue,
      inFlightSet,
      failedTasksMap,
      healthRecords,
      (task, byteLength) => {
        completedCount++;
        console.log(
          `  ✅ [ĐÃ XONG ${completedCount}/${totalTasks}] Lưu: ${task.publicAudioUrl} (${(byteLength / 1024).toFixed(1)} KB)`
        );
      },
      isStoppingRef
    )
  );

  await Promise.all(workerPromises);

  // Gom các task còn lại trong queue nếu tất cả worker đã down hoặc dừng
  while (taskQueue.length > 0) {
    const remaining = taskQueue.shift();
    if (remaining && !failedTasksMap.has(remaining.id)) {
      failedTasksMap.set(remaining.id, {
        task: remaining,
        error: new Error(
          isStoppingRef.current
            ? 'Tiến trình dừng bởi người dùng (SIGINT)'
            : 'Tất cả API key đều đã cạn kiệt Quota hoặc bị down'
        ),
      });
    }
  }

  // Handle results & temp.md
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
      } catch {
        // ignore
      }
    }
    console.log(`\n🎉 Xuất sắc! Đã hoàn tất 100% (${completedCount}/${totalTasks}) file âm thanh Listening!`);
  }
}

main().catch((err) => {
  console.error('❌ Lỗi tiến trình tạo TTS:', err);
  process.exit(1);
});
