import { NextResponse } from 'next/server';
import { clearAdminSessionCookie } from '@/server/auth';

export async function POST() {
  try {
    await clearAdminSessionCookie();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Không thể đăng xuất.' },
      { status: 500 }
    );
  }
}
