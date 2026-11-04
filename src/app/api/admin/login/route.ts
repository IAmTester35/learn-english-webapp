import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword, setAdminSessionCookie } from '@/server/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = body?.password;

    if (!password || typeof password !== 'string' || !verifyAdminPassword(password)) {
      return NextResponse.json(
        { error: 'Mật khẩu quản trị không chính xác.' },
        { status: 401 }
      );
    }

    await setAdminSessionCookie();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Mật khẩu quản trị không chính xác.' },
      { status: 401 }
    );
  }
}
