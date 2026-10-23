'use server';

import { cookies } from 'next/headers';
import type { TestProgressSummary, TestAttemptSummary } from '@/types/storage';
import { PROGRESS_SUMMARY_COOKIE, ATTEMPTS_SUMMARY_COOKIE } from '@/server/serverStorage';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function saveProgressSummaryAction(summary: TestProgressSummary): Promise<void> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(PROGRESS_SUMMARY_COOKIE)?.value;
    let current: TestProgressSummary[] = [];
    if (raw) {
      try {
        current = JSON.parse(decodeURIComponent(raw));
      } catch {
        current = [];
      }
    }
    const filtered = current.filter((p) => p.testId !== summary.testId);
    const updated = [summary, ...filtered];
    cookieStore.set(PROGRESS_SUMMARY_COOKIE, encodeURIComponent(JSON.stringify(updated)), {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      sameSite: 'lax',
    });
  } catch (err) {
    console.error('Lỗi khi lưu progress summary cookie:', err);
  }
}

export async function deleteProgressSummaryAction(testId: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(PROGRESS_SUMMARY_COOKIE)?.value;
    if (!raw) return;
    let current: TestProgressSummary[] = [];
    try {
      current = JSON.parse(decodeURIComponent(raw));
    } catch {
      return;
    }
    const updated = current.filter((p) => p.testId !== testId);
    cookieStore.set(PROGRESS_SUMMARY_COOKIE, encodeURIComponent(JSON.stringify(updated)), {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      sameSite: 'lax',
    });
  } catch (err) {
    console.error('Lỗi khi xóa progress summary cookie:', err);
  }
}

export async function saveAttemptSummaryAction(summary: TestAttemptSummary): Promise<void> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(ATTEMPTS_SUMMARY_COOKIE)?.value;
    let current: TestAttemptSummary[] = [];
    if (raw) {
      try {
        current = JSON.parse(decodeURIComponent(raw));
      } catch {
        current = [];
      }
    }
    const updated = [summary, ...current];
    cookieStore.set(ATTEMPTS_COOKIE_NAME(), encodeURIComponent(JSON.stringify(updated)), {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      sameSite: 'lax',
    });
  } catch (err) {
    console.error('Lỗi khi lưu attempt summary cookie:', err);
  }
}

function ATTEMPTS_COOKIE_NAME(): string {
  return ATTEMPTS_SUMMARY_COOKIE;
}
