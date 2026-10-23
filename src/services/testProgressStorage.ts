import type { TestDocument, UserAnswers, TestProgress } from '../types/test';
import { saveProgressSummaryAction, deleteProgressSummaryAction } from '@/app/actions/storageActions';

const STORAGE_KEY = 'english_webapp_progress_v1';

function notifyProgressChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('test-progress-changed'));
  }
}

export function getStoredProgressList(): TestProgress[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Lỗi khi đọc tiến độ bài thi từ localStorage:', err);
    return [];
  }
}

export function getProgressByTestId(testId: string): TestProgress | null {
  const list = getStoredProgressList();
  return list.find((p) => p.testId === testId) || null;
}

export function calculateProgressStats(
  test: TestDocument,
  answers: UserAnswers
): { answeredCount: number; totalCount: number } {
  let totalCount = 0;
  let answeredCount = 0;

  // Reading
  test.sections.reading.passages.forEach((p) => {
    totalCount += p.questions.length;
    p.questions.forEach((q) => {
      const ans = answers.reading[q.id];
      if (Array.isArray(ans) ? ans.length > 0 : typeof ans === 'string' && ans.trim() !== '') {
        answeredCount += 1;
      }
    });
  });

  // Listening
  test.sections.listening.parts.forEach((p) => {
    totalCount += p.questions.length;
    p.questions.forEach((q) => {
      const ans = answers.listening[q.id];
      if (Array.isArray(ans) ? ans.length > 0 : typeof ans === 'string' && ans.trim() !== '') {
        answeredCount += 1;
      }
    });
  });

  // Speaking (Temporarily disabled - not included in progress calculation)


  // Writing
  test.sections.writing.tasks.forEach((t) => {
    totalCount += 1;
    const ans = answers.writing[t.id];
    if (typeof ans === 'string' && ans.trim() !== '') {
      answeredCount += 1;
    }
  });

  return { answeredCount, totalCount };
}

let syncProgressTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncProgressSummary(progress: TestProgress): void {
  if (syncProgressTimeout) {
    clearTimeout(syncProgressTimeout);
  }
  syncProgressTimeout = setTimeout(() => {
    saveProgressSummaryAction({
      testId: progress.testId,
      testTitle: progress.testTitle,
      lastActiveSection: progress.lastActiveSection,
      updatedAt: progress.updatedAt,
      answeredCount: progress.answeredCount,
      totalCount: progress.totalCount,
    }).catch((err) => {
      console.error('Failed to sync progress summary to server cookie:', err);
    });
  }, 400);
}

export function saveTestProgress(progress: TestProgress): void {
  if (typeof window === 'undefined') return;
  const current = getStoredProgressList();
  const filtered = current.filter((p) => p.testId !== progress.testId);
  const updated = [progress, ...filtered];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  notifyProgressChanged();

  // Keep server-side cookie summary in sync for RSC (debounced & decoupled from render loop)
  scheduleSyncProgressSummary(progress);
}

export function deleteTestProgress(testId: string): void {
  if (typeof window === 'undefined') return;
  if (syncProgressTimeout) {
    clearTimeout(syncProgressTimeout);
  }
  const current = getStoredProgressList();
  const updated = current.filter((p) => p.testId !== testId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  notifyProgressChanged();

  // Keep server-side cookie summary in sync for RSC
  deleteProgressSummaryAction(testId).catch((err) => {
    console.error('Failed to delete progress summary from server cookie:', err);
  });
}
