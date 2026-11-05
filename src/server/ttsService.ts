import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import { Mp3Encoder } from '@breezystack/lamejs';
import {
  buildListeningTtsRequest,
  combineAudioPartsToWavBytes,
  getListeningTtsModel,
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
  getTestAudioMetadataList,
  getTestById,
  updateTestListeningPartAudioUrl,
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

/**
 * Checks if ffmpeg is available on the host machine.
 */
export function isFfmpegAvailable(): boolean {
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Encodes a WAV buffer (16-bit PCM) into an MP3 buffer in-memory.
 * - Uses ffmpeg via OS temp directory (192kbps, 24kHz) when available on host.
 * - Falls back to pure-JS @breezystack/lamejs in-memory encoder (128kbps, 24kHz) on serverless/Vercel.
 */
export function convertWavBytesToMp3Buffer(rawWavBytes: Uint8Array): {
  buffer: Uint8Array;
  format: 'mp3';
  bitrateKbps: number;
  sampleRate: number;
} {
  let sampleRate = 24000;
  if (rawWavBytes.byteLength > 44) {
    const headerView = new DataView(
      rawWavBytes.buffer,
      rawWavBytes.byteOffset,
      44
    );
    const parsedRate = headerView.getUint32(24, true);
    if (parsedRate >= 8000 && parsedRate <= 96000) {
      sampleRate = parsedRate;
    }
  }

  // 1. Try ffmpeg via OS temp dir if available for 192kbps studio encoding
  if (isFfmpegAvailable()) {
    const tmpId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tmpWav = path.join(os.tmpdir(), `${tmpId}.wav`);
    const tmpMp3 = path.join(os.tmpdir(), `${tmpId}.mp3`);
    try {
      fs.writeFileSync(tmpWav, rawWavBytes);
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
  const pcmBytes =
    rawWavBytes.byteLength > 44 ? rawWavBytes.subarray(44) : rawWavBytes;
  const sampleCount = Math.floor(pcmBytes.byteLength / 2);
  const samples = new Int16Array(sampleCount);
  const pcmView = new DataView(
    pcmBytes.buffer,
    pcmBytes.byteOffset,
    pcmBytes.byteLength
  );
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = pcmView.getInt16(i * 2, true);
  }

  const bitrateKbps = 128;
  const encoder = new Mp3Encoder(1, sampleRate, bitrateKbps);
  const chunkSize = 1152;
  const mp3Chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (let i = 0; i < samples.length; i += chunkSize) {
    const sampleChunk = samples.subarray(i, i + chunkSize);
    const mp3buf = encoder.encodeBuffer(sampleChunk);
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
  const maxRetries = 3;

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
        `[Storage Upload] Lần thử ${attempt}/${maxRetries} thất bại (${storagePath}): ${lastError.message}. Thử lại sau ${attempt * 600}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
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
  const existingAudioList = await getTestAudioMetadataList(cleanTestId);
  const existingAudioMap = new Map(existingAudioList.map((a) => [a.partId, a]));

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

  for (let idx = 0; idx < partsWithTranscript.length; idx++) {
    // Check if safe stop was requested before allocating keys or processing this part
    if (await isTtsStopRequestedAsync(cleanTestId)) {
      console.log(`[TTS Engine] 🛑 Đã nhận tín hiệu dừng an toàn cho "${cleanTestId}". Dừng xử lý các phần tiếp theo.`);
      for (let r = idx; r < partsWithTranscript.length; r++) {
        const remainingPart = partsWithTranscript[r];
        stats.skipped++;
        const j = ttsJobStore.get(cleanTestId);
        if (j) {
          const target = j.parts.find((p) => p.id === remainingPart.id);
          if (target && target.status === 'pending') {
            target.status = 'skipped';
            target.error = 'Đã dừng an toàn theo yêu cầu.';
          }
        }
      }
      break;
    }

    const part = partsWithTranscript[idx];
    const partIndexInDoc = allParts.findIndex((p) => p.id === part.id);
    const currentHash = computeListeningTranscriptHash(part);
    const existingMeta = existingAudioMap.get(part.id);

    const currentJob = ttsJobStore.get(cleanTestId);
    if (currentJob) {
      currentJob.currentPartIndex = idx + 1;
      currentJob.currentPartId = part.id;
      currentJob.currentPartTitle = part.title || part.id;
      currentJob.currentMessage = `Đang kiểm tra ${part.id} - ${part.title || ''}...`;
      const targetPart = currentJob.parts.find((p) => p.id === part.id);
      if (targetPart) {
        targetPart.status = 'processing';
      }
      currentJob.updatedAt = new Date().toISOString();
      await syncJobToSupabase(currentJob);
    }

    const hasValidSupabaseAudio =
      !options?.force &&
      typeof part.audioUrl === 'string' &&
      part.audioUrl.startsWith('http') &&
      (!existingMeta || existingMeta.transcriptHash === currentHash);

    if (hasValidSupabaseAudio) {
      stats.skipped++;
      if (currentJob) {
        currentJob.completed++;
        currentJob.percent = Math.round(
          (currentJob.completed / currentJob.total) * 100
        );
        const targetPart = currentJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'skipped';
          targetPart.webUrl = part.audioUrl;
          targetPart.byteLength = existingMeta?.fileSizeBytes;
          targetPart.durationSeconds = existingMeta?.durationSeconds;
        }
        currentJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(currentJob);
      }
      continue;
    }

    try {
      if (currentJob) {
        currentJob.currentMessage = `Đang gọi Gemini TTS tạo giọng đọc cho ${part.id}...`;
        currentJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(currentJob);
      }

      const wavBytes = await generateAudioBytesWithKeyRotation(
        part.transcript!,
        part.audioConfig,
        part.speakers,
        { isStopRequested: () => isTtsStopRequested(cleanTestId) }
      );

      if (currentJob) {
        currentJob.currentMessage = `Đang mã hóa MP3 & tải lên Supabase Storage cho ${part.id}...`;
        currentJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(currentJob);
      }

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
        partIndex: partIndexInDoc >= 0 ? partIndexInDoc : idx,
        storageBucket: uploaded.storageBucket,
        storagePath: uploaded.storagePath,
        publicUrl: uploaded.publicUrl,
        format: uploaded.format,
        fileSizeBytes: uploaded.byteLength,
        bitrateKbps: uploaded.bitrateKbps,
        sampleRate: uploaded.sampleRate,
        ttsModel: getListeningTtsModel(),
      });

      await updateTestListeningPartAudioUrl(
        cleanTestId,
        part.id,
        uploaded.publicUrl,
        audioMeta
      );

      stats.generated++;
      if (currentJob) {
        currentJob.completed++;
        currentJob.percent = Math.round(
          (currentJob.completed / currentJob.total) * 100
        );
        const targetPart = currentJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'completed';
          targetPart.webUrl = uploaded.publicUrl;
          targetPart.byteLength = uploaded.byteLength;
          targetPart.durationSeconds = audioMeta.durationSeconds;
        }
        currentJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(currentJob);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TTS Engine] ❌ Lỗi tạo audio cho part "${part.id}":`, errMsg);
      stats.errors.push(`Phần ${part.id}: ${errMsg}`);
      if (currentJob) {
        currentJob.completed++;
        currentJob.percent = Math.round(
          (currentJob.completed / currentJob.total) * 100
        );
        currentJob.errors.push(`Phần ${part.id}: ${errMsg}`);
        const targetPart = currentJob.parts.find((p) => p.id === part.id);
        if (targetPart) {
          targetPart.status = 'failed';
          targetPart.error = errMsg;
        }
        currentJob.updatedAt = new Date().toISOString();
        await syncJobToSupabase(currentJob);
      }
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
