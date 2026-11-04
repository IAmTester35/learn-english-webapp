import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isAuthenticated = await verifyAdminSession();
    return NextResponse.json({ isAuthenticated });
  } catch {
    return NextResponse.json({ isAuthenticated: false });
  }
}
