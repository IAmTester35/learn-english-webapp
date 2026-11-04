import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import {
  buildListeningTtsRequest,
  combineAudioPartsToWavBytes,
} from '../services/listeningTtsCore';
import type { ListeningAudioConfig, SpeakerConfig } from '../types/test';

// In-memory key cooldown map: maps API key string to timestamp (ms) when cooldown expires
export const keyCooldownMap = new Map<string, number>();

export interface TtsPartProgress {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'skipped' | 'failed';
  error?: string;
  webUrl?: string;
  byteLength?: number;
}

export interface TtsJobProgress {
  testId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  completed: number;
  currentPartIndex: number;
  currentPartId?: string;
  currentPartTitle?: string;
  currentMessage?: string;
  percent: number;
  parts: TtsPartProgress[];
  errors: string[];
  startedAt: string;
  updatedAt: string;
}

// In-memory live job store
const ttsJobStore = new Map<string, TtsJobProgress>();

export function getTtsJobProgress(testId: string): TtsJobProgress | null {
  const cleanId = testId.trim().replace(/\.json$/i, '');
  return ttsJobStore.get(cleanId) || null;
}

export function getAllTtsJobProgresses(): Record<string, TtsJobProgress> {
  return Object.fromEntries(ttsJobStore.entries());
}

// Cache GoogleGenAI client instances per API key
const clientCache = new Map<string, GoogleGenAI>();

export function getOrCreateGenAIClient(apiKey: string): GoogleGenAI {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clientCache.set(apiKey, client);
  }
  return client;
}

export function resetKeyCooldowns(): void {
  keyCooldownMap.clear();
}

/**
 * Loads all Gemini API keys from process.env, .env, and .env.local.
 * Filters out placeholders and duplicate keys.
 */
export function getAllGeminiApiKeys(): string[] {
  const envMap: Record<string, string> = {};
  const rootDir = process.cwd();
  const envFiles = [
    path.join(rootDir, '.env'),
    path.join(rootDir, '.env.local'),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(/*turbopackIgnore: true*/ envFile)) {
      try {
        const content = fs.readFileSync(/*turbopackIgnore: true*/ envFile, 'utf-8');
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
          if (key && val) {
            envMap[key] = val;
          }
        }
      } catch {
        // ignore file read error
      }
    }
  }

  const merged: Record<string, string | undefined> = { ...envMap, ...process.env };
  const validKeys: string[] = [];
  const seen = new Set<string>();

  for (const [key, value] of Object.entries(merged)) {
    if (/^GEMINI_API_KEY(_\w+)?$/i.test(key) && typeof value === 'string') {
      const trimmedVal = value.trim();
      if (
        trimmedVal.length > 0 &&
        !trimmedVal.toLowerCase().startsWith('your_gemini_api_key') &&
        !seen.has(trimmedVal)
      ) {
        seen.add(trimmedVal);
        validKeys.push(trimmedVal);
      }
    }
  }

  return validKeys;
}

/**
 * Retrieves the candidate keys:
 * - Prioritizes keys not currently in cooldown.
 * - If all keys are in cooldown, returns keys sorted by shortest remaining cooldown time.
 */
export function getAvailableGeminiApiKeys(): string[] {
  const allKeys = getAllGeminiApiKeys();
  if (allKeys.length === 0) return [];

  const now = Date.now();
  const available: string[] = [];
  const coolingDown: { key: string; expiresAt: number }[] = [];

  for (const key of allKeys) {
    const expiresAt = keyCooldownMap.get(key) || 0;
    if (expiresAt <= now) {
      available.push(key);
    } else {
      coolingDown.push({ key, expiresAt });
    }
  }

  if (available.length > 0) {
    // Shuffle available keys slightly to distribute load among healthy keys
    return available.sort(() => Math.random() - 0.5);
  }

  // All keys are currently in cooldown; order by shortest remaining cooldown
  coolingDown.sort((a, b) => a.expiresAt - b.expiresAt);
  return coolingDown.map((item) => item.key);
}

/**
 * Returns remaining cooldown milliseconds until at least one key becomes healthy.
 * Returns 0 if there is already at least one healthy key available.
 */
export function getShortestCooldownRemainingMs(): number {
  const allKeys = getAllGeminiApiKeys();
  if (allKeys.length === 0) return 0;
  const now = Date.now();
  let shortest = Infinity;
  for (const k of allKeys) {
    const exp = keyCooldownMap.get(k) || 0;
    if (exp <= now) return 0;
    const diff = exp - now;
    if (diff < shortest) shortest = diff;
  }
  return shortest === Infinity ? 0 : shortest;
}

export function isRateLimitError(err: unknown): boolean {
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

export function isTimeoutError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { name?: string; message?: string };
  if (anyErr.name === 'TimeoutError' || anyErr.name === 'AbortError') return true;
  const msg = (anyErr.message || String(err)).toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out');
}

export function isFatalError(err: unknown): boolean {
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

const TTS_TIMEOUT_MS = 45_000;

/**
 * Calls Gemini TTS API with an exact 45-second timeout.
 */
async function callGeminiTtsWithTimeout(
  client: GoogleGenAI,
  requestParams: ReturnType<typeof buildListeningTtsRequest>,
  timeoutMs = TTS_TIMEOUT_MS
) {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`Gemini TTS API call timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
    timeoutId.unref?.();
  });

  try {
    const response = await Promise.race([
      client.models.generateContent(requestParams),
      timeoutPromise,
    ]);
    return response;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Generates WAV audio bytes using Zero-Wait Failover across Gemini API keys.
 * If a key hits 429 Rate Limit or 45s Timeout, it immediately cools down for 2 minutes
 * and rotates to the next key without sleep delay.
 */
export async function generateAudioBytesWithKeyRotation(
  transcript: string,
  audioConfig?: ListeningAudioConfig,
  speakers?: SpeakerConfig[]
): Promise<Uint8Array> {
  const candidateKeys = getAvailableGeminiApiKeys();
  if (candidateKeys.length === 0) {
    throw new Error('Không tìm thấy Gemini API Key khả dụng (tất cả keys bị thiếu hoặc chưa cấu hình).');
  }

  const requestParams = buildListeningTtsRequest({
    transcript,
    audioConfig,
    speakers,
  });

  let lastError: unknown = null;

  for (const key of candidateKeys) {
    const keyShort = key.slice(0, 6) + '...' + key.slice(-4);
    const client = getOrCreateGenAIClient(key);

    try {
      const response = await callGeminiTtsWithTimeout(client, requestParams, TTS_TIMEOUT_MS);
      const parts =
        response.candidates?.[0]?.content?.parts
          ?.map((p) => p.inlineData)
          .filter((d): d is { data: string; mimeType?: string } => Boolean(d?.data)) || [];

      if (parts.length === 0) {
        throw new Error('Gemini API không trả về dữ liệu audio inlineData.');
      }

      const { bytes } = combineAudioPartsToWavBytes(parts);

      // On success: remove key from cooldown if it was degraded
      keyCooldownMap.delete(key);
      return bytes;
    } catch (err: unknown) {
      lastError = err;

      // 1. Fatal Error (401, 403, api_key_invalid): Cooldown 24h & rotate immediately
      if (isFatalError(err)) {
        console.warn(
          `[TTS Engine] Key ${keyShort} gặp lỗi Fatal (401/403): ${(err as Error)?.message}. Cooldown 24h. Chuyển key tiếp theo...`
        );
        keyCooldownMap.set(key, Date.now() + 24 * 60 * 60 * 1000);
        continue;
      }

      // 2. Rate Limit (429) OR Timeout (45s): Cooldown 2 min & ZERO-WAIT FAILOVER (0ms delay)
      if (isRateLimitError(err) || isTimeoutError(err)) {
        const reason = isTimeoutError(err) ? 'Timeout 45s' : 'Rate Limit (429)';
        console.warn(
          `[TTS Engine] Key ${keyShort} gặp ${reason}. Đặt cooldown 2 phút & Zero-wait failover ngay sang key tiếp theo!`
        );
        keyCooldownMap.set(key, Date.now() + 2 * 60 * 1000);
        continue;
      }

      // 3. Other unexpected transient errors: Cooldown 1 minute and failover
      console.warn(
        `[TTS Engine] Key ${keyShort} gặp lỗi: ${(err as Error)?.message}. Tạm cooldown 1 phút và thử key tiếp theo...`
      );
      keyCooldownMap.set(key, Date.now() + 60 * 1000);
      continue;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Tất cả API keys đều thất bại hoặc đang trong thời gian cooldown.');
}

/**
 * Checks if ffmpeg is available on the machine.
 */
export function isFfmpegAvailable(): boolean {
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

export interface SavedAudioResult {
  diskPath: string;
  webUrl: string;
  format: 'mp3' | 'wav';
  byteLength: number;
}

/**
 * Saves raw WAV audio bytes:
 * 1. Archives raw WAV copy to archive/audio/<filenameBase>.wav.
 * 2. If ffmpeg is available, converts to 192kbps MP3 (24kHz) at public/tests/audio/<filenameBase>.mp3.
 * 3. Fallback to saving WAV directly at public/tests/audio/<filenameBase>.wav.
 */
export function saveAudioBytes(
  filenameBase: string,
  rawWavBytes: Uint8Array
): SavedAudioResult {
  const rootDir = process.cwd();
  const archiveDir = path.join(rootDir, 'archive', 'audio');
  const testsAudioDir = path.join(rootDir, 'public', 'tests', 'audio');

  fs.mkdirSync(archiveDir, { recursive: true });
  fs.mkdirSync(testsAudioDir, { recursive: true });

  const cleanBase = filenameBase.replace(/\.(mp3|wav)$/i, '');

  // 1. Luôn lưu bản WAV raw vào thư mục lưu trữ archive/audio/
  const archiveWavPath = path.join(archiveDir, `${cleanBase}.wav`);
  try {
    fs.writeFileSync(archiveWavPath, rawWavBytes);
  } catch (err) {
    console.warn('[TTS Engine] Không thể ghi bản archive:', err);
  }

  // 2. Chuyển đổi sang MP3 192kbps (24000Hz) nếu có ffmpeg
  const hasFfmpeg = isFfmpegAvailable();
  if (hasFfmpeg) {
    const mp3DiskPath = path.join(testsAudioDir, `${cleanBase}.mp3`);
    const tempWav = path.join(testsAudioDir, `${cleanBase}.tmp.wav`);

    try {
      fs.writeFileSync(tempWav, rawWavBytes);
      const proc = spawnSync(
        'ffmpeg',
        ['-y', '-i', tempWav, '-b:a', '192k', '-ar', '24000', mp3DiskPath],
        { stdio: 'ignore' }
      );
      try {
        fs.unlinkSync(tempWav);
      } catch {
        // ignore unlink error
      }

      if (proc.status === 0 && fs.existsSync(mp3DiskPath) && fs.statSync(mp3DiskPath).size > 44) {
        return {
          diskPath: mp3DiskPath,
          webUrl: `/tests/audio/${cleanBase}.mp3`,
          format: 'mp3',
          byteLength: fs.statSync(mp3DiskPath).size,
        };
      }
    } catch (err) {
      console.warn('[TTS Engine] Lỗi khi convert MP3 qua ffmpeg, fallback sang WAV:', err);
    }
  }

  // 3. Fallback: lưu trực tiếp file WAV
  const wavDiskPath = path.join(testsAudioDir, `${cleanBase}.wav`);
  fs.writeFileSync(wavDiskPath, rawWavBytes);
  return {
    diskPath: wavDiskPath,
    webUrl: `/tests/audio/${cleanBase}.wav`,
    format: 'wav',
    byteLength: rawWavBytes.byteLength,
  };
}

// Mutex lock map to prevent concurrent writes corrupting individual test JSON documents
const fileMutexMap = new Map<string, Promise<void>>();

async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prevLock = fileMutexMap.get(filePath) || Promise.resolve();
  let releaseLock: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  fileMutexMap.set(filePath, currentLock);

  await prevLock;
  try {
    return await fn();
  } finally {
    releaseLock!();
  }
}

/**
 * Generates audio files for all listening parts of a specified test.
 * Incremental and atomic: updates the test JSON document immediately upon each completed part.
 */
export async function generateAudioForTest(testId: string): Promise<{
  total: number;
  generated: number;
  skipped: number;
  errors: string[];
}> {
  const cleanTestId = testId.trim().replace(/\.json$/i, '');
  const rootDir = process.cwd();
  const testsDir = path.join(rootDir, 'public', 'tests');
  const directPath = path.join(testsDir, `${cleanTestId}.json`);

  let targetFilePath = directPath;
  if (!fs.existsSync(targetFilePath)) {
    // Tìm kiếm trong thư mục tests nếu ID khác tên file
    const files = fs
      .readdirSync(testsDir)
      .filter((f) => f.endsWith('.json') && f !== 'index.json');
    let found = false;
    for (const f of files) {
      const p = path.join(testsDir, f);
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.id === cleanTestId || path.basename(f, '.json') === cleanTestId) {
          targetFilePath = p;
          found = true;
          break;
        }
      } catch {
        // continue
      }
    }
    if (!found) {
      throw new Error(`Không tìm thấy file đề thi cho testId: "${testId}"`);
    }
  }

  const rawJson = fs.readFileSync(targetFilePath, 'utf-8');
  const doc = JSON.parse(rawJson);
  const parts: Array<{
    id: string;
    title?: string;
    transcript?: string;
    audioUrl?: string;
    audioConfig?: ListeningAudioConfig;
    speakers?: SpeakerConfig[];
  }> = doc.sections?.listening?.parts || [];

  const partsWithTranscript = parts.filter((p) => p.transcript && p.transcript.trim().length > 0);

  // Initialize or update live job progress
  const nowIso = new Date().toISOString();
  const initialJob: TtsJobProgress = {
    testId: cleanTestId,
    status: partsWithTranscript.length === 0 ? 'completed' : 'processing',
    total: partsWithTranscript.length,
    completed: 0,
    currentPartIndex: 0,
    percent: partsWithTranscript.length === 0 ? 100 : 0,
    parts: partsWithTranscript.map((p) => ({
      id: p.id,
      title: p.title || p.id,
      status: 'pending',
    })),
    errors: [],
    startedAt: nowIso,
    updatedAt: nowIso,
  };
  ttsJobStore.set(cleanTestId, initialJob);

  const stats = {
    total: partsWithTranscript.length,
    generated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  const testsAudioDir = path.join(rootDir, 'public', 'tests', 'audio');
  fs.mkdirSync(testsAudioDir, { recursive: true });

  const fileBase = path.basename(targetFilePath, '.json');

  for (let idx = 0; idx < partsWithTranscript.length; idx++) {
    const part = partsWithTranscript[idx];
    const baseName = `${fileBase}-${part.id}`;
    const mp3Path = path.join(testsAudioDir, `${baseName}.mp3`);
    const wavPath = path.join(testsAudioDir, `${baseName}.wav`);

    // Update job tracking
    const currentJob = ttsJobStore.get(cleanTestId);
    if (currentJob) {
      currentJob.currentPartIndex = idx + 1;
      currentJob.currentPartId = part.id;
      currentJob.currentPartTitle = part.title || part.id;
      currentJob.currentMessage = `Đang xử lý ${part.id} - ${part.title || ''}...`;
      const targetPart = currentJob.parts.find((p) => p.id === part.id);
      if (targetPart) {
        targetPart.status = 'processing';
      }
      currentJob.updatedAt = new Date().toISOString();
    }

    // Kiểm tra xem file âm thanh đã tồn tại trên đĩa hay chưa
    const existingDiskPath =
      fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 44
        ? mp3Path
        : fs.existsSync(wavPath) && fs.statSync(wavPath).size > 44
        ? wavPath
        : null;

    if (existingDiskPath && part.audioUrl) {
      stats.skipped++;
      if (currentJob) {
        currentJob.completed++;
        currentJob.percent = Math.round((currentJob.completed / currentJob.total) * 100);
        const targetPart = currentJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'skipped';
          targetPart.webUrl = part.audioUrl;
          targetPart.byteLength = fs.statSync(existingDiskPath).size;
        }
        currentJob.updatedAt = new Date().toISOString();
      }
      continue;
    }

    if (existingDiskPath && !part.audioUrl) {
      const ext = path.extname(existingDiskPath);
      part.audioUrl = `/tests/audio/${baseName}${ext}`;
      await withFileLock(targetFilePath, async () => {
        fs.writeFileSync(targetFilePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
      });
      stats.skipped++;
      if (currentJob) {
        currentJob.completed++;
        currentJob.percent = Math.round((currentJob.completed / currentJob.total) * 100);
        const targetPart = currentJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'skipped';
          targetPart.webUrl = part.audioUrl;
          targetPart.byteLength = fs.statSync(existingDiskPath).size;
        }
        currentJob.updatedAt = new Date().toISOString();
      }
      continue;
    }

    // Chưa có file âm thanh: thực hiện tạo audio với Zero-Wait Rotation
    try {
      console.log(`[TTS Engine] Đang tạo audio cho ${baseName}...`);
      if (currentJob) {
        currentJob.currentMessage = `Đang gọi Gemini AI tạo giọng đọc cho ${part.id}...`;
        currentJob.updatedAt = new Date().toISOString();
      }

      const wavBytes = await generateAudioBytesWithKeyRotation(
        part.transcript!,
        part.audioConfig,
        part.speakers
      );

      if (currentJob) {
        currentJob.currentMessage = `Đang lưu và convert MP3 cho ${part.id}...`;
        currentJob.updatedAt = new Date().toISOString();
      }

      const saved = saveAudioBytes(baseName, wavBytes);
      part.audioUrl = saved.webUrl;

      // Cập nhật JSON ngay lập tức (Incremental Save)
      await withFileLock(targetFilePath, async () => {
        fs.writeFileSync(targetFilePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
      });

      stats.generated++;
      if (currentJob) {
        currentJob.completed++;
        currentJob.percent = Math.round((currentJob.completed / currentJob.total) * 100);
        const targetPart = currentJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'completed';
          targetPart.webUrl = saved.webUrl;
          targetPart.byteLength = saved.byteLength;
        }
        currentJob.updatedAt = new Date().toISOString();
      }
      console.log(
        `[TTS Engine] ✅ Hoàn thành ${baseName} -> ${saved.webUrl} (${(saved.byteLength / 1024).toFixed(1)} KB)`
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TTS Engine] ❌ Lỗi tạo audio cho part "${part.id}":`, errMsg);
      stats.errors.push(`Phần ${part.id}: ${errMsg}`);
      if (currentJob) {
        currentJob.completed++;
        currentJob.percent = Math.round((currentJob.completed / currentJob.total) * 100);
        currentJob.errors.push(`Phần ${part.id}: ${errMsg}`);
        const targetPart = currentJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'failed';
          targetPart.error = errMsg;
        }
        currentJob.updatedAt = new Date().toISOString();
      }
    }
  }

  // Finalize job status
  const finalJob = ttsJobStore.get(cleanTestId);
  if (finalJob) {
    finalJob.percent = 100;
    finalJob.currentPartId = undefined;
    finalJob.currentPartTitle = undefined;
    finalJob.status =
      finalJob.errors.length === 0
        ? 'completed'
        : stats.generated > 0 || stats.skipped > 0
        ? 'completed'
        : 'failed';
    finalJob.currentMessage =
      finalJob.status === 'completed'
        ? `Hoàn tất! Đã tạo ${stats.generated} phần, bỏ qua ${stats.skipped} phần.${stats.errors.length ? ` (${stats.errors.length} lỗi)` : ''}`
        : `Tạo audio thất bại (${stats.errors.length} lỗi).`;
    finalJob.updatedAt = new Date().toISOString();
  }

  return stats;
}

/**
 * Triggers background TTS generation without blocking the HTTP request/response.
 */
export function triggerBackgroundTts(testId: string): void {
  setImmediate(() => {
    generateAudioForTest(testId)
      .then((stats) => {
        console.log(`[TTS Engine] Background TTS hoàn tất cho "${testId}":`, stats);
      })
      .catch((err) => {
        console.error(`[TTS Engine] Background TTS thất bại cho "${testId}":`, err);
      });
  });
}
