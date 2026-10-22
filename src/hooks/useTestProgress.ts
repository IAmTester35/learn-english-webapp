'use client';

import { useSyncExternalStore } from 'react';
import type { TestProgress } from '@/types/test';
import { getStoredProgressList } from '@/services/testProgressStorage';

let cachedSnapshot: TestProgress[] = [];
let lastRawString: string | null = null;

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = () => callback();
  window.addEventListener('storage', onStorage);
  window.addEventListener('test-progress-changed', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('test-progress-changed', onStorage);
  };
}

function getSnapshot(): TestProgress[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('english_webapp_progress_v1');
  if (raw !== lastRawString) {
    lastRawString = raw;
    cachedSnapshot = getStoredProgressList();
  }
  return cachedSnapshot;
}

const emptyServerSnapshot: TestProgress[] = [];
function getServerSnapshot(): TestProgress[] {
  return emptyServerSnapshot;
}

export function useTestProgress(): TestProgress[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
