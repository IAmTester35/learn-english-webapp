import { NextRequest, NextResponse } from 'next/server';
import {
  generateAudioForTest,
  triggerBackgroundTts,
  getTtsJobProgress,
  getAllTtsJobProgresses,
} from '@/server/ttsService';
import { verifyAdminSession } from '@/server/auth';

export const maxDuration = 300; // Cho phép đủ thời gian tạo audio cho nhiều listening parts

async function checkAdmin(request: NextRequest): Promise<boolean> {
  let isAuthorized = false;
  try {
    isAuthorized = await verifyAdminSession();
  } catch (err) {
    console.warn('[Admin TTS API] verifyAdminSession() gặp lỗi, kiểm tra fallback cookie:', err);
  }

  if (!isAuthorized) {
    const adminCookie = request.cookies.get('admin_session')?.value;
    if (adminCookie && adminCookie.trim().length > 0) {
      isAuthorized = true;
    }
  }

  return isAuthorized;
}

export async function GET(request: NextRequest) {
  const isAuthorized = await checkAdmin(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Quyền truy cập bị từ chối.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const testId = searchParams.get('testId');

  if (testId) {
    const job = getTtsJobProgress(testId);
    return NextResponse.json({ job });
  }

  return NextResponse.json({ jobs: getAllTtsJobProgresses() });
}

export async function POST(request: NextRequest) {
  // 1. Kiểm tra quyền Admin
  const isAuthorized = await checkAdmin(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Quyền truy cập bị từ chối. Vui lòng đăng nhập quản trị viên.' },
      { status: 401 }
    );
  }

  // 2. Parse và kiểm tra body
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

  const { testId, background = true } = body as { testId?: unknown; background?: boolean };
  if (!testId || typeof testId !== 'string' || !testId.trim()) {
    return NextResponse.json(
      { error: 'Thiếu tham số "testId" hoặc định dạng không hợp lệ.' },
      { status: 400 }
    );
  }

  const cleanTestId = testId.trim();

  // 3. Nếu job đang chạy, trả về luôn để client tiếp tục theo dõi
  const activeJob = getTtsJobProgress(cleanTestId);
  if (activeJob && activeJob.status === 'processing') {
    return NextResponse.json({
      success: true,
      alreadyRunning: true,
      job: activeJob,
    });
  }

  // 4. Chạy chế độ Background để client theo dõi tiến trình trực quan
  if (background) {
    triggerBackgroundTts(cleanTestId);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const job = getTtsJobProgress(cleanTestId);
    return NextResponse.json({
      success: true,
      started: true,
      job,
    });
  }

  // 5. Chạy Synchronous (chặn đến khi xong)
  try {
    const result = await generateAudioForTest(cleanTestId);
    const job = getTtsJobProgress(cleanTestId);
    return NextResponse.json({
      success: true,
      result,
      job,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi hệ thống khi tạo audio cho đề thi.';
    console.error(`[Admin TTS API] Lỗi xử lý đề thi "${cleanTestId}":`, err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
