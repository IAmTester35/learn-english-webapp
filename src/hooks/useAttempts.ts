'use client';

import { useSyncExternalStore } from 'react';
import type { TestAttempt } from '@/types/test';
import { getStoredAttempts } from '@/services/attemptStorage';

let cachedSnapshot: TestAttempt[] = [];
let lastRawString: string | null = null;

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = () => callback();
  window.addEventListener('storage', onStorage);
  window.addEventListener('attempts-changed', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('attempts-changed', onStorage);
  };
}

function getSnapshot(): TestAttempt[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('english_webapp_attempts_v1');
  if (raw !== lastRawString) {
    lastRawString = raw;
    cachedSnapshot = getStoredAttempts();
  }
  return cachedSnapshot;
}

const emptyServerSnapshot: TestAttempt[] = [];
function getServerSnapshot(): TestAttempt[] {
  return emptyServerSnapshot;
}

export function useAttempts(): TestAttempt[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
