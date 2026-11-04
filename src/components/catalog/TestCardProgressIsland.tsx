'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, ArrowRight, RotateCcw } from 'lucide-react';
import type { TestProgressSummary, TestAttemptSummary } from '@/types/storage';
import { useTestProgress } from '@/hooks/useTestProgress';
import { useAttempts } from '@/hooks/useAttempts';
import { deleteTestProgress } from '@/services/testProgressStorage';

interface TestCardProgressIslandProps {
  testId: string;
  testTitle: string;
  mode: 'badge' | 'body' | 'actions' | 'list_badge' | 'list_actions';
  initialProgress?: TestProgressSummary | null;
  initialStats?: TestAttemptSummary | null;
}

export const TestCardProgressIsland: React.FC<TestCardProgressIslandProps> = ({
  testId,
  testTitle,
  mode,
  initialProgress,
  initialStats,
}) => {
  const router = useRouter();
  const isMounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  const clientProgressList = useTestProgress();
  const clientAttempts = useAttempts();

  // Find live progress & stats
  const progress = isMounted
    ? clientProgressList.find((p) => p.testId === testId) || null
    : initialProgress;

  const stats = isMounted
    ? (() => {
        const matches = clientAttempts.filter((a) => a.testId === testId);
        if (matches.length === 0) return null;
        const latest = matches[0];
        return {
          id: latest.id,
          testId,
          testTitle: latest.testTitle,
          submittedAt: latest.submittedAt,
          readingScore: `${latest.scores.reading.correctCount}/${latest.scores.reading.totalCount}`,
          listeningScore: `${latest.scores.listening.correctCount}/${latest.scores.listening.totalCount}`,
          count: matches.length,
        };
      })()
    : initialStats ? { ...initialStats, count: 1 } : null;

  const progressPercent = progress
    ? Math.round((progress.answeredCount / (progress.totalCount || 1)) * 100)
    : 0;

  // 1. Grid Card Header Badge
  if (mode === 'badge') {
    if (progress) {
      return (
        <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 border border-black bg-amber-300 text-black shrink-0">
          {progressPercent}%
        </span>
      );
    }
    if (stats) {
      return (
        <span className="text-[11px] font-semibold font-mono px-1.5 py-0.5 border border-emerald-800 bg-emerald-100 text-emerald-950 shrink-0">
          Đã nộp ({stats.count})
        </span>
      );
    }
    return null;
  }

  // 2. Grid Card Body (Progress Bar & Past Scores)
  if (mode === 'body') {
    return (
      <>
        {progress && (
          <div className="mt-2.5 p-2 border border-black bg-[#fff9e6] space-y-1">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-neutral-700">Tiến độ ({progress.lastActiveSection})</span>
              <span className="text-amber-950 font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 border border-black bg-white overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {stats && (
          <div className="mt-2 px-2 py-1 border border-neutral-300 bg-[#fcf8ed] text-xs font-mono text-neutral-700 flex items-center justify-between">
            <span suppressHydrationWarning className="text-[11px]">
              {new Date(stats.submittedAt).toLocaleDateString('vi-VN')}
            </span>
            <span className="font-semibold text-black text-[11px]">
              R: {stats.readingScore} • L: {stats.listeningScore}
            </span>
          </div>
        )}
      </>
    );
  }

  // 3. Grid Card Actions
  if (mode === 'actions') {
    if (progress) {
      return (
        <div className="pt-2 border-t border-neutral-300 space-y-2">
          <Link
            href={`/test/${testId}/${progress.lastActiveSection}`}
            prefetch={true}
            className="w-full py-2 px-3 bg-amber-300 hover:bg-amber-400 text-black font-bold text-xs sm:text-sm border-2 border-black text-center flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Tiếp tục</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <div className="flex items-center justify-between text-xs pt-0.5">
            {stats ? (
              <Link
                href={`/results/${stats.id}`}
                className="text-neutral-600 hover:text-black underline cursor-pointer"
              >
                Kết quả ({stats.readingScore} R)
              </Link>
            ) : <span />}

            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Xóa tiến độ và làm lại "${testTitle}"?`)) {
                  deleteTestProgress(testId);
                  router.push(`/test/${testId}/reading`);
                }
              }}
              className="text-neutral-500 hover:text-red-700 underline text-xs cursor-pointer ml-auto flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Làm lại</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="pt-2 border-t border-neutral-300 flex items-center gap-2">
        <Link
          href={`/test/${testId}`}
          prefetch={true}
          className="flex-1 px-3.5 py-2 bg-black text-[#fffdf5] font-bold text-xs sm:text-sm border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors text-center flex items-center justify-center gap-1 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          <span>Làm bài</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        {stats && (
          <Link
            href={`/results/${stats.id}`}
            className="px-2.5 py-2 bg-[#f4eed9] text-black font-semibold text-xs border-2 border-black hover:bg-black hover:text-[#fffdf5] transition-colors text-center cursor-pointer shrink-0"
          >
            Kết quả
          </Link>
        )}
      </div>
    );
  }

  // 4. List View Header Badge
  if (mode === 'list_badge') {
    return (
      <>
        {progress && (
          <span className="font-bold px-1.5 py-0.2 border border-black bg-amber-300 text-black text-[11px]">
            {progressPercent}%
          </span>
        )}
        {stats && (
          <span className="font-semibold px-1.5 py-0.2 border border-emerald-800 bg-emerald-100 text-emerald-950 text-[11px]">
            Đã nộp ({stats.count})
          </span>
        )}
      </>
    );
  }

  // 5. List View Actions
  if (mode === 'list_actions') {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {progress ? (
          <>
            <Link
              href={`/test/${testId}/${progress.lastActiveSection}`}
              prefetch={true}
              className="px-3 py-1.5 bg-amber-300 hover:bg-amber-400 text-black font-bold text-xs border border-black transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Tiếp tục</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Xóa tiến độ của "${testTitle}"?`)) {
                  deleteTestProgress(testId);
                  router.push(`/test/${testId}/reading`);
                }
              }}
              className="px-1 text-xs text-neutral-500 hover:text-red-700 underline cursor-pointer"
            >
              Làm lại
            </button>
          </>
        ) : (
          <Link
            href={`/test/${testId}`}
            prefetch={true}
            className="px-3 py-1.5 bg-black text-[#fffdf5] font-bold text-xs border border-black hover:bg-[#fffdf5] hover:text-black transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>Làm bài</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        )}
        {stats && (
          <Link
            href={`/results/${stats.id}`}
            className="px-2.5 py-1.5 bg-[#fcf8ed] text-black font-semibold text-xs border border-black hover:bg-black hover:text-[#fffdf5] transition-colors text-center cursor-pointer"
          >
            Kết quả
          </Link>
        )}
      </div>
    );
  }

  return null;
};
