import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  generateAudioForTest,
  triggerBackgroundTts,
  getTtsJobProgressAsync,
  getAllTtsJobProgresses,
  uploadManualPartAudioToSupabase,
} from '@/server/ttsService';
import { getTestAudioMetadataList, getTestById } from '@/server/testRepository';
import { verifyAdminSession } from '@/server/auth';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const isAuthorized = await verifyAdminSession();
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Quyền truy cập bị từ chối.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const testId = searchParams.get('testId');
  const includeAudioMeta = searchParams.get('includeAudioMeta') === 'true';

  if (testId) {
    const cleanId = testId.trim();
    const job = await getTtsJobProgressAsync(cleanId);

    if (includeAudioMeta) {
      const [audioMetadata, testDoc] = await Promise.all([
        getTestAudioMetadataList(cleanId),
        getTestById(cleanId, { allowHidden: true }),
      ]);
      const listeningParts = (testDoc?.sections?.listening?.parts || []).map((p, idx) => ({
        id: p.id,
        index: idx,
        title: p.title,
        audioUrl: p.audioUrl || null,
        hasTranscript: Boolean(p.transcript && p.transcript.trim().length > 0),
        scenario: p.audioConfig?.scenario || null,
        accent: p.audioConfig?.accent || null,
        pacing: p.audioConfig?.pacing || null,
      }));
      return NextResponse.json({ job, audioMetadata, listeningParts });
    }

    return NextResponse.json({ job });
  }

  return NextResponse.json({ jobs: getAllTtsJobProgresses() });
}

export async function POST(request: NextRequest) {
  const isAuthorized = await verifyAdminSession();
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Quyền truy cập bị từ chối. Vui lòng đăng nhập quản trị viên.' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Nội dung gửi lên phải là định dạng JSON hợp lệ.' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Dữ liệu không đúng định dạng đối tượng.' },
      { status: 400 }
    );
  }

  const {
    testId,
    background = true,
    force = false,
    partId,
  } = body as {
    testId?: unknown;
    background?: boolean;
    force?: boolean;
    partId?: string;
  };

  if (!testId || typeof testId !== 'string' || !testId.trim()) {
    return NextResponse.json(
      { error: 'Thiếu tham số "testId" hoặc định dạng không hợp lệ.' },
      { status: 400 }
    );
  }

  const cleanTestId = testId.trim();
  const cleanPartId = typeof partId === 'string' && partId.trim() ? partId.trim() : undefined;

  const activeJob = await getTtsJobProgressAsync(cleanTestId);
  if (activeJob && activeJob.status === 'processing' && !force) {
    return NextResponse.json({
      success: true,
      alreadyRunning: true,
      job: activeJob,
    });
  }

  if (background) {
    triggerBackgroundTts(cleanTestId, { force: Boolean(force), partId: cleanPartId });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const job = await getTtsJobProgressAsync(cleanTestId);
    return NextResponse.json({
      success: true,
      started: true,
      job,
    });
  }

  try {
    const result = await generateAudioForTest(cleanTestId, {
      force: Boolean(force),
      partId: cleanPartId,
    });
    const job = await getTtsJobProgressAsync(cleanTestId);
    try {
      revalidatePath(`/test/${cleanTestId}`);
      revalidatePath('/admin');
    } catch {
      // ignore revalidate error
    }
    return NextResponse.json({
      success: true,
      result,
      job,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi hệ thống khi tạo audio cho đề thi.';
    console.error(`[Admin TTS API] Lỗi xử lý đề thi "${cleanTestId}":`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/generate-tts
 * Cho phép Admin tải file âm thanh MP3/WAV trực tiếp lên Supabase Storage cho một phần nghe cụ thể.
 */
export async function PUT(request: NextRequest) {
  const isAuthorized = await verifyAdminSession();
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Quyền truy cập bị từ chối.' },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const testId = formData.get('testId');
    const partId = formData.get('partId');
    const file = formData.get('file');

    if (
      typeof testId !== 'string' ||
      !testId.trim() ||
      typeof partId !== 'string' ||
      !partId.trim() ||
      !(file instanceof File)
    ) {
      return NextResponse.json(
        { error: 'Thiếu testId, partId hoặc tệp âm thanh.' },
        { status: 400 }
      );
    }

    const lowerName = file.name.toLowerCase();
    const format: 'mp3' | 'wav' =
      lowerName.endsWith('.wav') || file.type.includes('wav') ? 'wav' : 'mp3';

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    const uploaded = await uploadManualPartAudioToSupabase({
      testId: testId.trim(),
      partId: partId.trim(),
      fileBuffer,
      format,
    });

    try {
      revalidatePath(`/test/${testId.trim()}`);
      revalidatePath('/admin');
    } catch {
      // ignore revalidate error
    }

    return NextResponse.json({
      success: true,
      ...uploaded,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi khi tải file audio lên Supabase.' },
      { status: 500 }
    );
  }
}
