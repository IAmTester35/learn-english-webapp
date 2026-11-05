import { NextRequest, NextResponse } from 'next/server';
import { signInAdminWithSupabase, DEFAULT_ADMIN_EMAIL } from '@/server/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' && body.email.trim()
      ? body.email.trim()
      : DEFAULT_ADMIN_EMAIL;
    const password = body?.password;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Vui lòng nhập mật khẩu quản trị.' },
        { status: 400 }
      );
    }

    const result = await signInAdminWithSupabase(email, password);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Thông tin đăng nhập không chính xác.' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      email: result.email,
    });
  } catch {
    return NextResponse.json(
      { error: 'Yêu cầu đăng nhập không hợp lệ.' },
      { status: 400 }
    );
  }
}
