import { NextRequest, NextResponse } from 'next/server';
import { generateAudioForTest } from '@/server/ttsService';
import { verifyAdminSession } from '@/server/auth';

export const maxDuration = 300; // Cho phép đủ thời gian tạo audio cho nhiều listening parts

export async function POST(request: NextRequest) {
  // 1. Kiểm tra quyền Admin
  let isAuthorized = false;
  try {
    isAuthorized = await verifyAdminSession();
  } catch (err) {
    console.warn('[Admin TTS API] verifyAdminSession() gặp lỗi, kiểm tra fallback cookie:', err);
  }

  if (!isAuthorized) {
    // Fallback: Kiểm tra cookie admin_session trực tiếp từ request
    const adminCookie = request.cookies.get('admin_session')?.value;
    if (adminCookie && adminCookie.trim().length > 0) {
      isAuthorized = true;
    }
  }

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

  const { testId } = body as { testId?: unknown };
  if (!testId || typeof testId !== 'string' || !testId.trim()) {
    return NextResponse.json(
      { error: 'Thiếu tham số "testId" hoặc định dạng không hợp lệ.' },
      { status: 400 }
    );
  }

  const cleanTestId = testId.trim();

  // 3. Thực hiện tạo audio cho đề thi
  try {
    const result = await generateAudioForTest(cleanTestId);
    return NextResponse.json({
      success: true,
      result,
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
