import fs from 'node:fs/promises';
import path from 'node:path';
import { unstable_cache, revalidateTag } from 'next/cache';
import type {
  TestAudioAssetMetadata,
  TestCatalog,
  TestCatalogItem,
  TestDocument,
} from '../types/test';
import { validateTestDocument } from '../domain/validator';
import {
  computeListeningTranscriptHash,
  extractTestDocumentMetadata,
} from '../domain/testMetadata';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { AUDIO_STORAGE_BUCKET } from '@/lib/supabase/config';

const TESTS_DIR = path.join(process.cwd(), 'public', 'tests');

const LEGACY_ID_ALIASES: Record<string, string> = {
  'test-01': 'a2-key-english-test-01',
  'test-02': 'b1-plus-applied-english-test-01',
  'test-03': 'c1-advanced-academic-test-01',
  'test-04': 'b1-intermediate-english-test-01',
};

interface SupabaseTestRow {
  id: string;
  schema_version: string;
  title: string;
  description: string;
  hidden: boolean;
  language: 'en' | 'zh' | 'other';
  exam_system: 'CEFR' | 'HSK' | 'OTHER';
  level: string;
  reading_passage_count: number;
  reading_question_count: number;
  listening_part_count: number;
  listening_question_count: number;
  speaking_task_count: number;
  writing_task_count: number;
  total_questions: number;
  audio_ready_count: number;
  metadata: Record<string, unknown>;
  content: TestDocument;
  created_at: string;
  updated_at: string;
}

/**
 * Fallback helper to read local static tests only when Supabase is unreachable.
 */
async function getLocalTestCatalogFallback(options?: {
  includeHidden?: boolean;
}): Promise<TestCatalog> {
  const indexPath = path.join(TESTS_DIR, 'index.json');
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tests)) {
      return { tests: [] };
    }
    const allTests = parsed.tests as TestCatalogItem[];
    const tests = options?.includeHidden
      ? allTests
      : allTests.filter((item) => item.hidden !== true);
    return { tests };
  } catch {
    return { tests: [] };
  }
}

export function revalidateTestCatalogCache(testId?: string): void {
  try {
    revalidateTag('test-catalog', 'max');
    if (testId) {
      revalidateTag(`test-${testId}`, 'max');
    }
  } catch {
    // Graceful fallback when called outside Next.js request lifecycle
  }
}

async function fetchTestCatalogFromSource(includeHidden: boolean): Promise<TestCatalog> {
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    let query = supabase
      .from('tests')
      .select(
        'id, title, description, hidden, language, exam_system, level, reading_passage_count, reading_question_count, listening_part_count, listening_question_count, speaking_task_count, writing_task_count, total_questions, audio_ready_count, updated_at'
      )
      .order('created_at', { ascending: true });

    if (!includeHidden) {
      query = query.eq('hidden', false);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      const tests: TestCatalogItem[] = data.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        file: `supabase://tests/${row.id}`,
        hidden: Boolean(row.hidden),
        language: row.language,
        examSystem: row.exam_system,
        level: row.level,
        readingPassageCount: row.reading_passage_count,
        readingQuestionCount: row.reading_question_count,
        listeningPartCount: row.listening_part_count,
        listeningQuestionCount: row.listening_question_count,
        speakingTaskCount: row.speaking_task_count,
        writingTaskCount: row.writing_task_count,
        totalQuestions: row.total_questions,
        audioReadyCount: row.audio_ready_count,
        updatedAt: row.updated_at,
      }));
      return { tests };
    }
  }

  return getLocalTestCatalogFallback({ includeHidden });
}

const getCachedTestCatalog = unstable_cache(
  async (includeHidden: boolean) => fetchTestCatalogFromSource(includeHidden),
  ['test-catalog'],
  {
    revalidate: 60,
    tags: ['test-catalog'],
  }
);

/**
 * Lấy danh mục bài thi kèm metadata đầy đủ từ bảng `public.tests` trên Supabase.
 * Mặc định lọc bỏ các bài bị ẩn trừ khi options.includeHidden = true.
 */
export async function getTestCatalog(options?: {
  includeHidden?: boolean;
}): Promise<TestCatalog> {
  const includeHidden = Boolean(options?.includeHidden);
  try {
    return await getCachedTestCatalog(includeHidden);
  } catch {
    return fetchTestCatalogFromSource(includeHidden);
  }
}

async function fetchTestByIdFromSource(
  resolvedId: string
): Promise<Pick<SupabaseTestRow, 'id' | 'hidden' | 'content'> | null> {
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('tests')
      .select('id, hidden, content')
      .eq('id', resolvedId)
      .maybeSingle();

    if (!error && data) {
      return data as Pick<SupabaseTestRow, 'id' | 'hidden' | 'content'>;
    }
  }
  return null;
}

const getCachedTestRowById = unstable_cache(
  async (resolvedId: string) => fetchTestByIdFromSource(resolvedId),
  ['test-by-id'],
  {
    revalidate: 300,
    tags: ['test-catalog'],
  }
);

/**
 * Lấy nội dung chi tiết bài thi theo ID từ Supabase `public.tests`.
 * Nếu bài bị ẩn mà không có options.allowHidden = true, trả về null để bảo mật.
 */
export async function getTestById(
  id: string,
  options?: { allowHidden?: boolean }
): Promise<TestDocument | null> {
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return null;
  }

  const resolvedId = LEGACY_ID_ALIASES[id] || id;
  let row: Pick<SupabaseTestRow, 'id' | 'hidden' | 'content'> | null = null;
  try {
    row = await getCachedTestRowById(resolvedId);
  } catch {
    row = await fetchTestByIdFromSource(resolvedId);
  }

  if (row) {
    if (row.hidden && !options?.allowHidden) {
      return null;
    }

    const validation = validateTestDocument(row.content);
    if (!validation.valid || !validation.data) {
      console.error(`Lỗi quy chuẩn JSON bài thi ${id} trong Supabase:`, validation.errors);
      throw new Error(`Đề thi "${id}" không đạt chuẩn dữ liệu.`);
    }

    validation.data.id = row.id;
    return validation.data;
  }

  // Fallback to local filesystem only if Supabase does not have the test
  const catalog = await getLocalTestCatalogFallback({ includeHidden: true });
  const catalogItem = catalog.tests.find(
    (item) =>
      item.id === resolvedId ||
      item.id === id ||
      path.basename(item.file, path.extname(item.file)) === resolvedId
  );

  if (!catalogItem) {
    return null;
  }

  if (catalogItem.hidden === true && !options?.allowHidden) {
    return null;
  }

  const filename = path.basename(catalogItem.file);
  const targetPath = path.join(TESTS_DIR, filename);

  try {
    const raw = await fs.readFile(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validation = validateTestDocument(parsed);
    if (!validation.valid || !validation.data) {
      throw new Error(`Đề thi "${id}" không đạt chuẩn dữ liệu.`);
    }
    validation.data.id = catalogItem.id;
    return validation.data;
  } catch {
    return null;
  }
}

/**
 * Đảo ngược trạng thái hiển thị (hidden) của đề thi trong Supabase `public.tests`.
 */
export async function toggleTestVisibility(
  id: string
): Promise<{ success: boolean; id: string; hidden: boolean }> {
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Mã bài thi "${id}" không hợp lệ.`);
  }

  const resolvedId = LEGACY_ID_ALIASES[id] || id;
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase Admin.');
  }

  const { data: current, error: fetchErr } = await supabase
    .from('tests')
    .select('id, hidden')
    .eq('id', resolvedId)
    .maybeSingle();

  if (fetchErr || !current) {
    throw new Error(`Không tìm thấy bài thi với mã ID "${id}" trên Supabase.`);
  }

  const newHidden = !current.hidden;
  const { error: updateErr } = await supabase
    .from('tests')
    .update({
      hidden: newHidden,
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id);

  if (updateErr) {
    throw new Error(`Lỗi khi cập nhật trạng thái ẩn/hiện: ${updateErr.message}`);
  }

  revalidateTestCatalogCache(current.id);

  return {
    success: true,
    id: current.id,
    hidden: newHidden,
  };
}

/**
 * Lưu đề thi mới (hoặc cập nhật nếu options.overwrite = true) kèm metadata đầy đủ vào Supabase `public.tests`.
 */
export async function saveTestDocument(
  doc: unknown,
  options?: { overwrite?: boolean; hidden?: boolean }
): Promise<{ success: boolean; isNew: boolean; message: string; id: string }> {
  const validation = validateTestDocument(doc);
  if (!validation.valid || !validation.data) {
    throw new Error(
      `Dữ liệu đề thi không đạt chuẩn quy định:\n- ${validation.errors.join('\n- ')}`
    );
  }

  const validDoc = validation.data;
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase Admin.');
  }

  const { data: existing } = await supabase
    .from('tests')
    .select('id, hidden, content')
    .eq('id', validDoc.id)
    .maybeSingle();

  if (existing && !options?.overwrite) {
    throw new Error(
      `Đề thi với mã ID "${validDoc.id}" đã tồn tại trên hệ thống. Bật tùy chọn ghi đè hoặc đổi mã ID khác.`
    );
  }

  // If overwriting an existing test, preserve existing Supabase Storage audioUrl on parts whose transcript has not changed
  if (existing?.content) {
    const prevDoc = existing.content as TestDocument;
    const prevParts = prevDoc.sections?.listening?.parts || [];
    const nextParts = validDoc.sections?.listening?.parts || [];

    for (const nextPart of nextParts) {
      if (!nextPart.audioUrl || nextPart.audioUrl.startsWith('/tests/audio/')) {
        const prevPart = prevParts.find((p) => p.id === nextPart.id);
        if (
          prevPart?.audioUrl &&
          prevPart.audioUrl.startsWith('http') &&
          computeListeningTranscriptHash(prevPart) ===
            computeListeningTranscriptHash(nextPart)
        ) {
          nextPart.audioUrl = prevPart.audioUrl;
        }
      }
    }
  }

  const meta = extractTestDocumentMetadata(validDoc);
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from('tests').upsert(
    {
      id: validDoc.id,
      schema_version: validDoc.schemaVersion || '1.0.0',
      title: validDoc.title,
      description: validDoc.description,
      hidden:
        typeof options?.hidden === 'boolean'
          ? options.hidden
          : existing
          ? existing.hidden
          : false,
      language: meta.language,
      exam_system: meta.examSystem,
      level: meta.level,
      reading_passage_count: meta.readingPassageCount,
      reading_question_count: meta.readingQuestionCount,
      listening_part_count: meta.listeningPartCount,
      listening_question_count: meta.listeningQuestionCount,
      speaking_task_count: meta.speakingTaskCount,
      writing_task_count: meta.writingTaskCount,
      total_questions: meta.totalQuestions,
      audio_ready_count: meta.audioReadyCount,
      metadata: meta.metadataJson,
      content: validDoc,
      updated_at: nowIso,
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(`Lỗi khi lưu đề thi vào Supabase: ${error.message}`);
  }

  revalidateTestCatalogCache(validDoc.id);

  return {
    success: true,
    isNew: !existing,
    id: validDoc.id,
    message: existing
      ? `Đã cập nhật thành công đề thi "${validDoc.title}" (ID: ${validDoc.id}) trên Supabase.`
      : `Đã lưu thành công đề thi "${validDoc.title}" (ID: ${validDoc.id}) lên Supabase.`,
  };
}

/**
 * Xóa đề thi khỏi Supabase `public.tests` và dọn dẹp triệt để các file audio trong bucket `test-audio`.
 * Đảm bảo:
 *  1. Quét toàn bộ file trong thư mục storage `${id}/` lẫn các đường dẫn trong bảng `test_audio`.
 *  2. BẮT BUỘC AWAIT quá trình xóa file trên Supabase Storage trước khi hoàn thành response.
 *  3. Xóa dữ liệu DB trong `tests`, `test_audio`, và `tts_jobs`.
 */
export async function deleteTestById(id: string): Promise<{ success: boolean; id: string }> {
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Mã bài thi "${id}" không hợp lệ.`);
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase Admin.');
  }

  // 1. Lấy danh sách đường dẫn lưu trữ từ bảng test_audio trước khi xóa DB
  const { data: audioRows } = await supabase
    .from('test_audio')
    .select('storage_path')
    .eq('test_id', id);

  const dbPaths = (audioRows || []).map((r) => r.storage_path).filter(Boolean);

  // 2. Quét trực tiếp thư mục ${id} trong Storage bucket test-audio để tìm tất cả các file (kể cả file sinh dở hoặc không ghi vào bảng DB)
  let folderPaths: string[] = [];
  try {
    const { data: storageObjects, error: listErr } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .list(id, { limit: 1000 });

    if (!listErr && storageObjects) {
      folderPaths = storageObjects
        .filter((item) => item.name && !item.name.startsWith('.'))
        .map((item) => `${id}/${item.name}`);
    }
  } catch (scanErr) {
    console.warn(`[Storage Clean] Không thể quét thư mục audio "${id}":`, scanErr);
  }

  const allAudioPaths = Array.from(new Set([...dbPaths, ...folderPaths]));

  // 3. Xóa triệt để toàn bộ file audio khỏi Supabase Storage và BẮT BUỘC AWAIT để tránh bị kill process
  if (allAudioPaths.length > 0) {
    try {
      const { error: removeErr } = await supabase.storage
        .from(AUDIO_STORAGE_BUCKET)
        .remove(allAudioPaths);

      if (removeErr) {
        console.error(`[Storage Delete] Lỗi xóa file audio cho đề "${id}":`, removeErr.message);
      }
    } catch (removeEx) {
      console.error(`[Storage Delete] Ngoại lệ khi xóa file audio cho đề "${id}":`, removeEx);
    }
  }

  // 4. Xóa bài thi khỏi bảng public.tests (Cascade sẽ tự động xóa test_audio & tts_jobs)
  const { error: testDeleteErr } = await supabase.from('tests').delete().eq('id', id);
  if (testDeleteErr) {
    throw new Error(`Lỗi khi xóa đề thi "${id}": ${testDeleteErr.message}`);
  }

  // 5. Dự phòng: Dọn dẹp test_audio và tts_jobs nếu cascade DB chưa kịp hoàn tất
  await Promise.allSettled([
    supabase.from('test_audio').delete().eq('test_id', id),
    supabase.from('tts_jobs').delete().eq('test_id', id),
  ]);

  revalidateTestCatalogCache(id);

  return { success: true, id };
}

/**
 * Quét dọn các thư mục audio mồ côi (orphaned audio) trong Storage bucket `test-audio`
 * mà mã đề thi (testId) tương ứng không còn tồn tại trong bảng `public.tests`.
 */
export async function cleanupOrphanedAudioStorage(): Promise<{
  deletedFolders: string[];
  deletedFilesCount: number;
}> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { deletedFolders: [], deletedFilesCount: 0 };
  }

  const { data: testRows } = await supabase.from('tests').select('id');
  const validTestIds = new Set((testRows || []).map((t) => t.id));

  const { data: rootItems, error: listErr } = await supabase.storage
    .from(AUDIO_STORAGE_BUCKET)
    .list();

  if (listErr || !rootItems) {
    return { deletedFolders: [], deletedFilesCount: 0 };
  }

  const orphanedFolders = rootItems
    .filter((item) => !item.id && !validTestIds.has(item.name))
    .map((item) => item.name);

  let totalDeletedFiles = 0;
  const deletedFolders: string[] = [];

  for (const folderName of orphanedFolders) {
    const { data: files } = await supabase.storage
      .from(AUDIO_STORAGE_BUCKET)
      .list(folderName, { limit: 1000 });

    if (files && files.length > 0) {
      const filePaths = files.map((f) => `${folderName}/${f.name}`);
      await supabase.storage.from(AUDIO_STORAGE_BUCKET).remove(filePaths);
      totalDeletedFiles += filePaths.length;
    }
    deletedFolders.push(folderName);
  }

  return { deletedFolders, deletedFilesCount: totalDeletedFiles };
}

/**
 * Cập nhật đường dẫn audioUrl của một phần nghe cụ thể trong cột JSONB `content` của `public.tests`,
 * đồng thời cập nhật metadata tổng quan và lưu bản ghi chi tiết vào `public.test_audio`.
 */
export async function updateTestListeningPartAudioUrl(
  testId: string,
  partId: string,
  audioUrl: string,
  audioMeta?: TestAudioAssetMetadata
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const { data, error } = await supabase
    .from('tests')
    .select('content')
    .eq('id', testId)
    .maybeSingle();

  if (error || !data?.content) return;

  const content = data.content as TestDocument;
  const parts = content.sections?.listening?.parts;
  if (!Array.isArray(parts)) return;

  const targetPart = parts.find((p) => p.id === partId);
  if (!targetPart) return;

  targetPart.audioUrl = audioUrl;
  const meta = extractTestDocumentMetadata(content);
  const nowIso = new Date().toISOString();

  await supabase
    .from('tests')
    .update({
      content,
      audio_ready_count: meta.audioReadyCount,
      metadata: meta.metadataJson,
      updated_at: nowIso,
    })
    .eq('id', testId);

  if (audioMeta) {
    await upsertTestAudioMetadata(audioMeta);
  }

  revalidateTestCatalogCache(testId);
}

/**
 * Lưu hoặc cập nhật bản ghi metadata của file audio vào bảng `public.test_audio`.
 */
export async function upsertTestAudioMetadata(
  audioMeta: TestAudioAssetMetadata
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const nowIso = new Date().toISOString();
  await supabase.from('test_audio').upsert(
    {
      test_id: audioMeta.testId,
      part_id: audioMeta.partId,
      part_index: audioMeta.partIndex,
      part_title: audioMeta.partTitle,
      storage_bucket: audioMeta.storageBucket,
      storage_path: audioMeta.storagePath,
      public_url: audioMeta.publicUrl,
      mime_type: audioMeta.mimeType,
      format: audioMeta.format,
      file_size_bytes: audioMeta.fileSizeBytes,
      duration_seconds: audioMeta.durationSeconds,
      sample_rate: audioMeta.sampleRate,
      bitrate_kbps: audioMeta.bitrateKbps,
      channels: audioMeta.channels,
      language_code: audioMeta.languageCode,
      scenario: audioMeta.scenario || null,
      accent: audioMeta.accent || null,
      pacing: audioMeta.pacing || null,
      speakers: audioMeta.speakers,
      transcript_hash: audioMeta.transcriptHash,
      transcript_char_count: audioMeta.transcriptCharCount,
      turn_count: audioMeta.turnCount,
      tts_model: audioMeta.ttsModel,
      metadata: {
        overallStyle: undefined,
        updatedAt: nowIso,
      },
      updated_at: nowIso,
    },
    { onConflict: 'test_id,part_id' }
  );
}

/**
 * Lấy danh sách metadata audio của một đề thi từ bảng `public.test_audio`.
 * Chỉ select đúng các trường kỹ thuật cần thiết, không dùng select *.
 */
export async function getTestAudioMetadataList(
  testId: string
): Promise<TestAudioAssetMetadata[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('test_audio')
    .select(
      'id, test_id, part_id, part_index, part_title, storage_bucket, storage_path, public_url, mime_type, format, file_size_bytes, duration_seconds, sample_rate, bitrate_kbps, channels, language_code, scenario, accent, pacing, speakers, transcript_hash, transcript_char_count, turn_count, tts_model, updated_at'
    )
    .eq('test_id', testId)
    .order('part_index', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    testId: row.test_id,
    partId: row.part_id,
    partIndex: row.part_index,
    partTitle: row.part_title,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    mimeType: row.mime_type,
    format: row.format,
    fileSizeBytes: Number(row.file_size_bytes || 0),
    durationSeconds: row.duration_seconds !== null ? Number(row.duration_seconds) : null,
    sampleRate: row.sample_rate,
    bitrateKbps: row.bitrate_kbps,
    channels: row.channels,
    languageCode: row.language_code,
    scenario: row.scenario || undefined,
    accent: row.accent || undefined,
    pacing: row.pacing || undefined,
    speakers: Array.isArray(row.speakers) ? row.speakers : [],
    transcriptHash: row.transcript_hash,
    transcriptCharCount: row.transcript_char_count,
    turnCount: row.turn_count,
    ttsModel: row.tts_model,
    updatedAt: row.updated_at,
  }));
}

export interface TestAudioSummaryItem {
  partId: string;
  transcriptHash: string;
  fileSizeBytes: number;
  durationSeconds: number | null;
}

/**
 * Lấy tóm tắt metadata audio chỉ gồm các trường phục vụ kiểm tra/so khớp transcript hash cho TTS.
 * Chỉ select đúng 4 trường cần thiết (part_id, transcript_hash, file_size_bytes, duration_seconds),
 * loại bỏ hoàn toàn việc truyền tải 25 trường metadata chi tiết và JSON speakers nặng.
 */
export async function getTestAudioSummaryMap(
  testId: string
): Promise<Map<string, TestAudioSummaryItem>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from('test_audio')
    .select('part_id, transcript_hash, file_size_bytes, duration_seconds')
    .eq('test_id', testId);

  if (error || !data) return new Map();

  return new Map(
    data.map((row) => [
      row.part_id,
      {
        partId: row.part_id,
        transcriptHash: row.transcript_hash,
        fileSizeBytes: Number(row.file_size_bytes || 0),
        durationSeconds:
          row.duration_seconds !== null ? Number(row.duration_seconds) : null,
      },
    ])
  );
}

export interface MinimalListeningPart {
  id: string;
  title: string;
  audioUrl?: string | null;
  transcript?: string;
  audioConfig?: {
    scenario?: string;
    accent?: string;
    pacing?: string;
  };
}

/**
 * Chỉ trích xuất mảng `listening.parts` trực tiếp từ JSONB trong DB Postgres bằng toán tử mũi tên PostgREST,
 * tuyệt đối không tải toàn bộ cột content JSONB (vốn chứa cả Reading, Writing, Speaking 50-100KB).
 */
export async function getTestListeningPartsOnly(
  testId: string
): Promise<MinimalListeningPart[]> {
  const cleanId = testId.trim();
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('tests')
    .select('content->sections->listening->parts')
    .eq('id', cleanId)
    .maybeSingle();

  if (error || !data) return [];

  const rawParts = (data as unknown as { parts?: MinimalListeningPart[] })?.parts;
  return Array.isArray(rawParts) ? rawParts : [];
}
