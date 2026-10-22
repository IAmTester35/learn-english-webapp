import type { TestAttempt } from '../types/test';

const STORAGE_KEY = 'english_webapp_attempts_v1';

function notifyStorageChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('attempts-changed'));
  }
}

export function getStoredAttempts(): TestAttempt[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Lỗi khi đọc lịch sử làm bài từ localStorage:', err);
    return [];
  }
}

export function getAttemptById(attemptId: string): TestAttempt | null {
  const attempts = getStoredAttempts();
  return attempts.find((a) => a.id === attemptId) || null;
}

export function saveNewAttempt(attempt: TestAttempt): void {
  if (typeof window === 'undefined') return;
  const current = getStoredAttempts();
  const updated = [attempt, ...current];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  notifyStorageChanged();
}

export function updateDeferredReview(
  attemptId: string,
  sectionType: 'speaking' | 'writing',
  taskId: string,
  updates: { score?: string | number; notes?: string; status: 'pending_review' | 'reviewed' }
): TestAttempt[] {
  if (typeof window === 'undefined') return [];
  const attempts = getStoredAttempts();
  const updatedAttempts = attempts.map((att) => {
    if (att.id !== attemptId) return att;

    const listKey = sectionType === 'speaking' ? 'speakingReviews' : 'writingReviews';
    const updatedReviews = att[listKey].map((task) => {
      if (task.taskId !== taskId) return task;
      return {
        ...task,
        ...updates,
      };
    });

    return {
      ...att,
      [listKey]: updatedReviews,
    };
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedAttempts));
  notifyStorageChanged();
  return updatedAttempts;
}

export function deleteAttempt(attemptId: string): TestAttempt[] {
  if (typeof window === 'undefined') return [];
  const attempts = getStoredAttempts();
  const updated = attempts.filter((att) => att.id !== attemptId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  notifyStorageChanged();
  return updated;
}
