import 'server-only';
import { cookies } from 'next/headers';
import type { TestProgressSummary, TestAttemptSummary } from '@/types/storage';

export const PROGRESS_SUMMARY_COOKIE = 'eng_prog_summary_v1';
export const ATTEMPTS_SUMMARY_COOKIE = 'eng_att_summary_v1';

export async function getServerProgressSummaries(): Promise<TestProgressSummary[]> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(PROGRESS_SUMMARY_COOKIE)?.value;
    if (!raw) return [];
    const parsed = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    console.error('Lỗi khi đọc progress cookie trên server:', err);
    return [];
  }
}

export async function getServerAttemptSummaries(): Promise<TestAttemptSummary[]> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(ATTEMPTS_SUMMARY_COOKIE)?.value;
    if (!raw) return [];
    const parsed = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    console.error('Lỗi khi đọc attempts cookie trên server:', err);
    return [];
  }
}
