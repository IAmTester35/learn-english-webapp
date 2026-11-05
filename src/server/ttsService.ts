import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import { Mp3Encoder } from '@breezystack/lamejs';
import {
  buildListeningTtsRequest,
  combineAudioPartsToWavBytes,
  extractPcmFromWav,
  getListeningTtsModel,
  pcm16ToWavBytes,
} from '../services/listeningTtsCore';
import type {
  ListeningAudioConfig,
  ListeningPart,
  SpeakerConfig,
} from '../types/test';
import {
  buildListeningAudioMetadata,
  computeListeningTranscriptHash,
} from '../domain/testMetadata';
import {
  executeWithGeminiKeyRotation,
  isFatalError,
  isRateLimitError,
  isTimeoutError,
  loadEnvGeminiKeys,
  resetAllKeyCooldownsInSupabase,
} from './geminiKeyManager';
import {
  getTestAudioSummaryMap,
  getTestById,
  updateTestDocumentContent,
  updateTestListeningPartAudioUrl,
  upsertTestAudioMetadata,
} from './testRepository';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { AUDIO_STORAGE_BUCKET } from '@/lib/supabase/config';

export { isFatalError, isRateLimitError, isTimeoutError };

export interface TtsPartProgress {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'skipped' | 'failed';
  error?: string;
  webUrl?: string;
  byteLength?: number;
  durationSeconds?: number | null;
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
  stopRequested?: boolean;
}

// In-memory live job store (synced with Supabase public.tts_jobs)
const ttsJobStore = new Map<string, TtsJobProgress>();

// In-memory stop signals set
const ttsStopSignals = new Set<string>();

export function requestStopTts(testId: string): TtsJobProgress | null {
  const cleanId = testId.trim().replace(/\.json$/i, '');
  ttsStopSignals.add(cleanId);
  const job = ttsJobStore.get(cleanId);
  if (job) {
    job.stopRequested = true;
    job.currentMessage = '[STOP_REQUESTED] Đang dừng an toàn... Các phần đang xử lý sẽ hoàn tất, không cấp phát thêm key.';
    job.updatedAt = new Date().toISOString();
    void syncJobToSupabase(job);
    return job;
  }
  return null;
}

export function isTtsStopRequested(testId: string): boolean {
  const cleanId = testId.trim().replace(/\.json$/i, '');
  if (ttsStopSignals.has(cleanId)) return true;
  const job = ttsJobStore.get(cleanId);
  return Boolean(job?.stopRequested);
}

export async function isTtsStopRequestedAsync(testId: string): Promise<boolean> {
  const cleanId = testId.trim().replace(/\.json$/i, '');
  if (isTtsStopRequested(cleanId)) return true;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from('tts_jobs')
      .select('current_message')
      .eq('test_id', cleanId)
      .maybeSingle();
    if (data?.current_message?.includes('[STOP_REQUESTED]')) {
      ttsStopSignals.add(cleanId);
      return true;
    }
  } catch {
    // Non-fatal
  }
  return false;
}

async function syncJobToSupabase(job: TtsJobProgress): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  try {
    await supabase.from('tts_jobs').upsert(
      {
        test_id: job.testId,
        status: job.status,
        total: job.total,
        completed: job.completed,
        current_part_index: job.currentPartIndex,
        current_part_id: job.currentPartId || null,
        current_part_title: job.currentPartTitle || null,
        current_message: job.currentMessage || null,
        percent: job.percent,
        parts: job.parts,
        errors: job.errors,
        started_at: job.startedAt,
        updated_at: job.updatedAt,
      },
      { onConflict: 'test_id' }
    );
  } catch {
    // Non-fatal if tts_jobs sync fails transiently
  }
}

export function getTtsJobProgress(testId: string): TtsJobProgress | null {
  const cleanId = testId.trim().replace(/\.json$/i, '');
  return ttsJobStore.get(cleanId) || null;
}

export async function getTtsJobProgressAsync(
  testId: string
): Promise<TtsJobProgress | null> {
  const cleanId = testId.trim().replace(/\.json$/i, '');
  const inMemory = ttsJobStore.get(cleanId);
  if (inMemory) {
    return inMemory;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('tts_jobs')
      .select(
        'test_id, status, total, completed, current_part_index, current_part_id, current_part_title, current_message, percent, parts, errors, started_at, updated_at'
      )
      .eq('test_id', cleanId)
      .maybeSingle();

    if (error || !data) return null;

    const job: TtsJobProgress = {
      testId: data.test_id,
      status: data.status,
      total: data.total,
      completed: data.completed,
      currentPartIndex: data.current_part_index,
      currentPartId: data.current_part_id || undefined,
      currentPartTitle: data.current_part_title || undefined,
      currentMessage: data.current_message || undefined,
      percent: data.percent,
      parts: Array.isArray(data.parts) ? data.parts : [],
      errors: Array.isArray(data.errors) ? data.errors : [],
      startedAt: data.started_at,
      updatedAt: data.updated_at,
    };
    ttsJobStore.set(cleanId, job);
    return job;
  } catch {
    return null;
  }
}

export function getAllTtsJobProgresses(): Record<string, TtsJobProgress> {
  return Object.fromEntries(ttsJobStore.entries());
}

export function resetKeyCooldowns(): void {
  void resetAllKeyCooldownsInSupabase();
}

export function getAllGeminiApiKeys(): string[] {
  return loadEnvGeminiKeys().map((k) => k.apiKey);
}

export function getShortestCooldownRemainingMs(): number {
  return 0;
}

const TTS_TIMEOUT_MS = 90_000;

/**
 * Calls Gemini TTS API with an exact 90-second timeout.
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
    return await Promise.race([
      client.models.generateContent(requestParams),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Generates WAV audio bytes using Zero-Wait Failover across Supabase-managed Gemini API keys.
 */
export async function generateAudioBytesWithKeyRotation(
  transcript: string,
  audioConfig?: ListeningAudioConfig,
  speakers?: SpeakerConfig[],
  options?: { isStopRequested?: () => boolean }
): Promise<Uint8Array> {
  const requestParams = buildListeningTtsRequest({
    transcript,
    audioConfig,
    speakers,
  });

  return executeWithGeminiKeyRotation(
    async (client) => {
      const response = await callGeminiTtsWithTimeout(
        client,
        requestParams,
        TTS_TIMEOUT_MS
      );
      const parts =
        response.candidates?.[0]?.content?.parts
          ?.map((p) => p.inlineData)
          .filter((d): d is { data: string; mimeType?: string } => Boolean(d?.data)) ||
        [];

      if (parts.length === 0) {
        throw new Error('Gemini API không trả về dữ liệu audio inlineData.');
      }

      const { bytes } = combineAudioPartsToWavBytes(parts);
      return bytes;
    },
    { isStopRequested: options?.isStopRequested }
  );
}

let cachedFfmpegAvailable: boolean | null = null;

/**
 * Checks if ffmpeg is available on the host machine (cached in-memory).
 */
export function isFfmpegAvailable(): boolean {
  if (cachedFfmpegAvailable !== null) {
    return cachedFfmpegAvailable;
  }
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    cachedFfmpegAvailable = res.status === 0;
  } catch {
    cachedFfmpegAvailable = false;
  }
  return cachedFfmpegAvailable;
}

/**
 * Encodes a WAV buffer (16-bit PCM) into an MP3 buffer in-memory.
 * - Extracts purely the audio PCM payload from the 'data' chunk, stripping
 *   any trailing C2PA signature manifests or metadata chunks that sound like white noise.
 * - Uses ffmpeg via OS temp directory (192kbps, 24kHz) when available on host.
 * - Falls back to pure-JS @breezystack/lamejs in-memory encoder (128kbps, 24kHz) on serverless/Vercel.
 */
export function convertWavBytesToMp3Buffer(rawWavBytes: Uint8Array): {
  buffer: Uint8Array;
  format: 'mp3';
  bitrateKbps: number;
  sampleRate: number;
} {
  const parsed = extractPcmFromWav(rawWavBytes);
  const sampleRate = parsed.sampleRate || 24000;
  const channels = parsed.channels || 1;

  // 1. Try ffmpeg via OS temp dir if available for 192kbps studio encoding
  if (isFfmpegAvailable()) {
    const tmpId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tmpWav = path.join(os.tmpdir(), `${tmpId}.wav`);
    const tmpMp3 = path.join(os.tmpdir(), `${tmpId}.mp3`);
    try {
      const cleanWavBytes = pcm16ToWavBytes(parsed.pcmBytes, sampleRate);
      fs.writeFileSync(tmpWav, cleanWavBytes);
      const proc = spawnSync(
        'ffmpeg',
        ['-y', '-i', tmpWav, '-b:a', '192k', '-ar', String(sampleRate), tmpMp3],
        { stdio: 'ignore' }
      );
      if (proc.status === 0 && fs.existsSync(tmpMp3)) {
        const mp3Buf = new Uint8Array(fs.readFileSync(tmpMp3));
        if (mp3Buf.byteLength > 44) {
          return {
            buffer: mp3Buf,
            format: 'mp3',
            bitrateKbps: 192,
            sampleRate,
          };
        }
      }
    } catch {
      // Fall through to pure-JS lamejs encoder
    } finally {
      try {
        if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
        if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3);
      } catch {
        // ignore temp cleanup errors
      }
    }
  }

  // 2. Pure-JS in-memory MP3 encoding via @breezystack/lamejs (works on Vercel & serverless Next.js)
  const pcmBytes = parsed.pcmBytes;
  const sampleCount = Math.floor(pcmBytes.byteLength / 2);
  const pcmView = new DataView(
    pcmBytes.buffer,
    pcmBytes.byteOffset,
    pcmBytes.byteLength
  );

  let leftSamples: Int16Array;
  let rightSamples: Int16Array | undefined;

  if (channels === 2) {
    const totalFrames = Math.floor(sampleCount / 2);
    leftSamples = new Int16Array(totalFrames);
    rightSamples = new Int16Array(totalFrames);
    for (let i = 0; i < totalFrames; i++) {
      leftSamples[i] = pcmView.getInt16(i * 4, true);
      rightSamples[i] = pcmView.getInt16(i * 4 + 2, true);
    }
  } else {
    leftSamples = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      leftSamples[i] = pcmView.getInt16(i * 2, true);
    }
  }

  const bitrateKbps = 128;
  const encoder = new Mp3Encoder(channels, sampleRate, bitrateKbps);
  const chunkSize = 1152;
  const mp3Chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (let i = 0; i < leftSamples.length; i += chunkSize) {
    const leftChunk = leftSamples.subarray(i, i + chunkSize);
    const rightChunk = rightSamples ? rightSamples.subarray(i, i + chunkSize) : undefined;
    const mp3buf = rightChunk
      ? encoder.encodeBuffer(leftChunk, rightChunk)
      : encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) {
      const copy = new Uint8Array(mp3buf.buffer, mp3buf.byteOffset, mp3buf.byteLength);
      mp3Chunks.push(new Uint8Array(copy));
      totalBytes += copy.byteLength;
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    const copy = new Uint8Array(flushed.buffer, flushed.byteOffset, flushed.byteLength);
    mp3Chunks.push(new Uint8Array(copy));
    totalBytes += copy.byteLength;
  }

  const finalMp3 = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of mp3Chunks) {
    finalMp3.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    buffer: finalMp3,
    format: 'mp3',
    bitrateKbps,
    sampleRate,
  };
}

export interface UploadedAudioResult {
  storageBucket: string;
  storagePath: string;
  publicUrl: string;
  format: 'mp3' | 'wav';
  byteLength: number;
  bitrateKbps: number;
  sampleRate: number;
}

/**
 * Uploads encoded audio bytes directly to Supabase Storage bucket `test-audio`
 * and returns the public CDN URL + technical audio metadata.
 */
export async function uploadAudioBytesToSupabase(params: {
  testId: string;
  partId: string;
  audioBytes: Uint8Array;
  format?: 'mp3' | 'wav';
  bitrateKbps?: number;
  sampleRate?: number;
}): Promise<UploadedAudioResult> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Admin để lưu trữ audio.');
  }

  const format = params.format || 'mp3';
  const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
  const storagePath = `${params.testId}/${params.partId}.${format}`;

  let lastError: Error | null = null;
  const maxRetries = 4;

  const filePayload = Buffer.isBuffer(params.audioBytes)
    ? params.audioBytes
    : Buffer.from(params.audioBytes);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { error: uploadError } = await supabase.storage
        .from(AUDIO_STORAGE_BUCKET)
        .upload(storagePath, filePayload, {
          contentType: mimeType,
          cacheControl: '31536000',
          upsert: true,
        });

      if (!uploadError) {
        lastError = null;
        break;
      }

      lastError = new Error(
        `Lỗi tải file audio lên Supabase Storage (${storagePath}): ${uploadError.message}`
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < maxRetries) {
      console.warn(
        `[Storage Upload] Lần thử ${attempt}/${maxRetries} thất bại (${storagePath}): ${lastError.message}. Thử lại sau ${attempt * 1000}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  if (lastError) {
    throw lastError;
  }

  const { data: publicUrlData } = supabase.storage
    .from(AUDIO_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  // Append cache-busting version query parameter when regenerating so browsers fetch latest audio
  const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  return {
    storageBucket: AUDIO_STORAGE_BUCKET,
    storagePath,
    publicUrl,
    format,
    byteLength: params.audioBytes.byteLength,
    bitrateKbps: params.bitrateKbps || (format === 'mp3' ? 192 : 384),
    sampleRate: params.sampleRate || 24000,
  };
}

/**
 * Legacy helper retained for CLI compatibility (`scripts/generate-tts.ts`).
 */
export interface SavedAudioResult {
  diskPath: string;
  webUrl: string;
  format: 'mp3' | 'wav';
  byteLength: number;
}

export function saveAudioBytes(
  filenameBase: string,
  rawWavBytes: Uint8Array
): SavedAudioResult {
  const cleanBase = filenameBase.replace(/\.(mp3|wav)$/i, '');
  const encoded = convertWavBytesToMp3Buffer(rawWavBytes);
  const testsAudioDir = path.join(process.cwd(), 'public', 'tests', 'audio');
  fs.mkdirSync(testsAudioDir, { recursive: true });
  const mp3DiskPath = path.join(testsAudioDir, `${cleanBase}.mp3`);
  fs.writeFileSync(mp3DiskPath, encoded.buffer);
  return {
    diskPath: mp3DiskPath,
    webUrl: `/tests/audio/${cleanBase}.mp3`,
    format: 'mp3',
    byteLength: encoded.buffer.byteLength,
  };
}

/**
 * Allows Admin to manually upload an MP3 or WAV audio file for a specific listening part
 * directly to Supabase Storage and updates `public.tests` + `public.test_audio`.
 */
export async function uploadManualPartAudioToSupabase(params: {
  testId: string;
  partId: string;
  fileBuffer: Uint8Array;
  format: 'mp3' | 'wav';
}): Promise<{
  publicUrl: string;
  byteLength: number;
  durationSeconds: number | null;
}> {
  const cleanTestId = params.testId.trim();
  const doc = await getTestById(cleanTestId, { allowHidden: true });
  if (!doc) {
    throw new Error(`Không tìm thấy đề thi "${cleanTestId}" trên Supabase.`);
  }

  const parts = doc.sections?.listening?.parts || [];
  const partIndex = parts.findIndex((p) => p.id === params.partId);
  if (partIndex === -1) {
    throw new Error(
      `Không tìm thấy phần nghe "${params.partId}" trong đề thi "${cleanTestId}".`
    );
  }
  const part = parts[partIndex];

  // If user uploaded WAV, convert to MP3 in-memory for optimal streaming
  let targetBuffer = params.fileBuffer;
  let targetFormat: 'mp3' | 'wav' = params.format;
  let bitrateKbps = 192;
  let sampleRate = 24000;

  if (params.format === 'wav') {
    const converted = convertWavBytesToMp3Buffer(params.fileBuffer);
    targetBuffer = converted.buffer;
    targetFormat = 'mp3';
    bitrateKbps = converted.bitrateKbps;
    sampleRate = converted.sampleRate;
  }

  const uploaded = await uploadAudioBytesToSupabase({
    testId: cleanTestId,
    partId: part.id,
    audioBytes: targetBuffer,
    format: targetFormat,
    bitrateKbps,
    sampleRate,
  });

  const audioMeta = buildListeningAudioMetadata({
    testId: cleanTestId,
    part,
    partIndex,
    storageBucket: uploaded.storageBucket,
    storagePath: uploaded.storagePath,
    publicUrl: uploaded.publicUrl,
    format: uploaded.format,
    fileSizeBytes: uploaded.byteLength,
    bitrateKbps: uploaded.bitrateKbps,
    sampleRate: uploaded.sampleRate,
    ttsModel: 'manual-upload',
  });

  await updateTestListeningPartAudioUrl(
    cleanTestId,
    part.id,
    uploaded.publicUrl,
    audioMeta
  );

  return {
    publicUrl: uploaded.publicUrl,
    byteLength: uploaded.byteLength,
    durationSeconds: audioMeta.durationSeconds,
  };
}

/**
 * Generates audio files for listening parts of a specified test directly in Supabase:
 * - Reads TestDocument from `public.tests`
 * - Generates audio via Gemini TTS with Zero-Wait Key Rotation
 * - Encodes to MP3 in-memory
 * - Uploads MP3 to Supabase Storage bucket `test-audio`
 * - Updates `public.tests.content`, `public.test_audio` metadata, and `public.tts_jobs` progress
 */
export async function generateAudioForTest(
  testId: string,
  options?: { force?: boolean; partId?: string }
): Promise<{
  total: number;
  generated: number;
  skipped: number;
  errors: string[];
}> {
  const cleanTestId = testId.trim().replace(/\.json$/i, '');
  const doc = await getTestById(cleanTestId, { allowHidden: true });

  if (!doc) {
    throw new Error(`Không tìm thấy đề thi "${cleanTestId}" trên Supabase.`);
  }

  const allParts: ListeningPart[] = doc.sections?.listening?.parts || [];
  const existingAudioMap = await getTestAudioSummaryMap(cleanTestId);

  const partsWithTranscript = allParts.filter((p) => {
    if (!p.transcript || !p.transcript.trim()) return false;
    if (options?.partId && p.id !== options.partId) return false;
    return true;
  });

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
  await syncJobToSupabase(initialJob);

  const stats = {
    total: partsWithTranscript.length,
    generated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  if (partsWithTranscript.length === 0) {
    return stats;
  }

  // Khởi tạo Worker Pool Producer-Consumer song song
  // Concurrency tối đa 4 luồng song song (phù hợp với pool 7 Gemini keys trên server)
  const CONCURRENCY = Math.min(partsWithTranscript.length, 4);
  const queue = partsWithTranscript.map((part, queueIndex) => ({
    part,
    queueIndex,
  }));
  let hasNewGeneratedAudio = false;

  // Chuỗi lưu tài liệu an toàn tuần tự (in-memory Promise chain),
  // đảm bảo vừa lưu tức thời ngay khi xong mỗi part (chống mất link khi timeout giữa chừng),
  // vừa không xảy ra race condition ghi đè JSON giữa các workers.
  let saveDocChain = Promise.resolve();
  const persistDocSnapshot = () => {
    saveDocChain = saveDocChain.then(async () => {
      try {
        await updateTestDocumentContent(cleanTestId, doc);
      } catch (saveErr) {
        console.warn(`[TTS Engine] Lỗi lưu cập nhật tiến trình đề thi "${cleanTestId}":`, saveErr);
      }
    });
  };

  async function processPartTask(
    item: { part: ListeningPart; queueIndex: number },
    workerId: number
  ): Promise<void> {
    const { part, queueIndex } = item;
    const partIndexInDoc = allParts.findIndex((p) => p.id === part.id);
    const currentHash = computeListeningTranscriptHash(part);
    const existingMeta = existingAudioMap.get(part.id);

    // Kiểm tra tín hiệu dừng an toàn
    if (await isTtsStopRequestedAsync(cleanTestId)) {
      stats.skipped++;
      const currentJob = ttsJobStore.get(cleanTestId);
      if (currentJob) {
        currentJob.completed++;
        currentJob.percent = Math.round((currentJob.completed / currentJob.total) * 100);
        const targetPart = currentJob.parts.find((p) => p.id === part.id);
        if (targetPart && targetPart.status === 'pending') {
          targetPart.status = 'skipped';
          targetPart.error = 'Đã dừng an toàn theo yêu cầu.';
        }
        await syncJobToSupabase(currentJob);
      }
      return;
    }

    const currentJob = ttsJobStore.get(cleanTestId);
    if (currentJob) {
      const targetPart = currentJob.parts.find((p) => p.id === part.id);
      if (targetPart) {
        targetPart.status = 'processing';
      }
      currentJob.currentPartId = part.id;
      currentJob.currentPartTitle = part.title || part.id;
      currentJob.currentMessage = `Worker ${workerId}: Đang xử lý ${part.id} - ${part.title || ''}...`;
      currentJob.updatedAt = new Date().toISOString();
      await syncJobToSupabase(currentJob);
    }

    const hasValidAudioInDoc =
      !options?.force &&
      typeof part.audioUrl === 'string' &&
      part.audioUrl.startsWith('http') &&
      (!existingMeta || existingMeta.transcriptHash === currentHash);

    // Tự phục hồi: Nếu trong DB public.test_audio đã có file hoàn chỉnh và hash trùng khớp
    // (phòng trường hợp lần trước bị timeout ở part khác nên doc chưa lưu, không cần sinh lại)
    const hasValidExistingAudioInDb =
      !options?.force &&
      Boolean(
        existingMeta &&
        typeof existingMeta.publicUrl === 'string' &&
        existingMeta.publicUrl.startsWith('http') &&
        existingMeta.transcriptHash === currentHash
      );

    if (hasValidAudioInDoc || hasValidExistingAudioInDb) {
      if (!part.audioUrl && existingMeta?.publicUrl) {
        part.audioUrl = existingMeta.publicUrl;
        hasNewGeneratedAudio = true;
        persistDocSnapshot();
      }

      stats.skipped++;
      const cJob = ttsJobStore.get(cleanTestId);
      if (cJob) {
        cJob.completed++;
        cJob.percent = Math.round((cJob.completed / cJob.total) * 100);
        const targetPart = cJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'skipped';
          targetPart.webUrl = part.audioUrl || existingMeta?.publicUrl || undefined;
          targetPart.byteLength = existingMeta?.fileSizeBytes;
          targetPart.durationSeconds = existingMeta?.durationSeconds;
        }
        cJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(cJob);
      }
      return;
    }

    try {
      const cJob = ttsJobStore.get(cleanTestId);
      if (cJob) {
        cJob.currentMessage = `Worker ${workerId}: Đang gọi Gemini TTS tạo giọng đọc cho ${part.id}...`;
        cJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(cJob);
      }

      const wavBytes = await generateAudioBytesWithKeyRotation(
        part.transcript!,
        part.audioConfig,
        part.speakers,
        { isStopRequested: () => isTtsStopRequested(cleanTestId) }
      );

      const encoded = convertWavBytesToMp3Buffer(wavBytes);
      const uploaded = await uploadAudioBytesToSupabase({
        testId: cleanTestId,
        partId: part.id,
        audioBytes: encoded.buffer,
        format: encoded.format,
        bitrateKbps: encoded.bitrateKbps,
        sampleRate: encoded.sampleRate,
      });

      const audioMeta = buildListeningAudioMetadata({
        testId: cleanTestId,
        part,
        partIndex: partIndexInDoc >= 0 ? partIndexInDoc : queueIndex,
        storageBucket: uploaded.storageBucket,
        storagePath: uploaded.storagePath,
        publicUrl: uploaded.publicUrl,
        format: uploaded.format,
        fileSizeBytes: uploaded.byteLength,
        bitrateKbps: uploaded.bitrateKbps,
        sampleRate: uploaded.sampleRate,
        ttsModel: getListeningTtsModel(),
      });

      // 1. Lưu ngay bản ghi chi tiết vào public.test_audio (DB Trigger trg_sync_test_audio_ready_count tự tăng audio_ready_count)
      await upsertTestAudioMetadata(audioMeta);

      // 2. Gán link audio vào bản document in-memory (không ghi đè race condition qua HTTP)
      part.audioUrl = uploaded.publicUrl;
      hasNewGeneratedAudio = true;

      // 3. Lưu tiến trình JSONB ngay lập tức (tuần tự qua promise chain, không race condition)
      persistDocSnapshot();

      stats.generated++;
      const successJob = ttsJobStore.get(cleanTestId);
      if (successJob) {
        successJob.completed++;
        successJob.percent = Math.round((successJob.completed / successJob.total) * 100);
        const targetPart = successJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'completed';
          targetPart.webUrl = uploaded.publicUrl;
          targetPart.byteLength = uploaded.byteLength;
          targetPart.durationSeconds = audioMeta.durationSeconds;
        }
        successJob.currentMessage = `Worker ${workerId}: Đã tạo xong ${part.id}.`;
        successJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(successJob);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TTS Engine] ❌ Worker ${workerId} lỗi part "${part.id}":`, errMsg);
      stats.errors.push(`Phần ${part.id}: ${errMsg}`);
      const errJob = ttsJobStore.get(cleanTestId);
      if (errJob) {
        errJob.completed++;
        errJob.percent = Math.round((errJob.completed / errJob.total) * 100);
        errJob.errors.push(`Phần ${part.id}: ${errMsg}`);
        const targetPart = errJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'failed';
          targetPart.error = errMsg;
        }
        errJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(errJob);
      }
    }
  }

  async function runWorker(workerId: number): Promise<void> {
    while (queue.length > 0) {
      if (isTtsStopRequested(cleanTestId)) {
        break;
      }
      const task = queue.shift();
      if (!task) break;
      await processPartTask(task, workerId);
    }
  }

  console.log(
    `[TTS Engine] ⚡ Khởi chạy Worker Pool song song: ${CONCURRENCY} workers cho ${partsWithTranscript.length} phần nghe của "${cleanTestId}".`
  );

  const workerPromises = Array.from({ length: CONCURRENCY }, (_, i) => runWorker(i + 1));
  await Promise.all(workerPromises);

  // Chờ chuỗi lưu snapshot cuối cùng hoàn tất
  await saveDocChain;

  // Lưu đồng bộ toàn bộ nội dung JSONB của đề thi một lần duy nhất, loại bỏ hoàn toàn race condition
  if (hasNewGeneratedAudio) {
    try {
      await updateTestDocumentContent(cleanTestId, doc);
      console.log(`[TTS Engine] 💾 Đã lưu đồng bộ nội dung đề thi "${cleanTestId}" vào public.tests.`);
    } catch (saveErr) {
      console.error(`[TTS Engine] Lỗi lưu content đề thi "${cleanTestId}":`, saveErr);
    }
  }

  const wasStopped = isTtsStopRequested(cleanTestId);
  ttsStopSignals.delete(cleanTestId);

  const finalJob = ttsJobStore.get(cleanTestId);
  if (finalJob) {
    finalJob.percent = 100;
    finalJob.currentPartId = undefined;
    finalJob.currentPartTitle = undefined;
    finalJob.stopRequested = false;

    if (wasStopped) {
      finalJob.status = stats.generated > 0 || stats.skipped > 0 ? 'completed' : 'failed';
      finalJob.currentMessage = `Đã dừng an toàn theo yêu cầu. Đã tạo ${stats.generated} phần, có sẵn ${stats.skipped} phần.${stats.errors.length ? ` (${stats.errors.length} lỗi)` : ''}`;
    } else {
      finalJob.status =
        finalJob.errors.length === 0
          ? 'completed'
          : stats.generated > 0 || stats.skipped > 0
            ? 'completed'
            : 'failed';
      finalJob.currentMessage =
        finalJob.status === 'completed'
          ? `Hoàn tất trên Supabase! Đã tạo mới ${stats.generated} phần, có sẵn ${stats.skipped} phần.${stats.errors.length ? ` (${stats.errors.length} lỗi)` : ''
          }`
          : `Tạo audio thất bại (${stats.errors.length} lỗi).`;
    }
    finalJob.updatedAt = new Date().toISOString();
    await syncJobToSupabase(finalJob);
  }

  return stats;
}

/**
 * Triggers background TTS generation without blocking the HTTP request/response.
 */
export function triggerBackgroundTts(
  testId: string,
  options?: { force?: boolean; partId?: string }
): void {
  setImmediate(() => {
    generateAudioForTest(testId, options)
      .then((stats) => {
        console.log(
          `[TTS Engine] Background TTS hoàn tất trên Supabase cho "${testId}":`,
          stats
        );
      })
      .catch((err) => {
        console.error(
          `[TTS Engine] Background TTS thất bại cho "${testId}":`,
          err
        );
      });
  });
}
