'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

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
        <span className="text-xs font-black font-mono px-2 py-0.5 border-2 border-black bg-amber-300 text-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
          <span>Đang dở {progressPercent}%</span>
        </span>
      );
    }
    if (stats) {
      return (
        <span className="text-xs font-bold font-mono px-2 py-0.5 border border-emerald-800 bg-emerald-100 text-emerald-950 flex items-center gap-1 shrink-0">
          <span>✓ Đã nộp ({stats.count})</span>
        </span>
      );
    }
    return (
      <span className="text-[11px] font-semibold font-mono px-2 py-0.5 border border-neutral-300 text-neutral-500 shrink-0">
        Chưa làm
      </span>
    );
  }

  // 2. Grid Card Body (Progress Bar & Past Scores)
  if (mode === 'body') {
    return (
      <>
        {progress && (
          <div className="mt-3 p-2.5 border-2 border-black bg-[#fff9e6] space-y-1.5">
            <div className="flex justify-between items-center text-xs font-mono font-bold text-black">
              <span className="flex items-center gap-1">
                <span className="text-neutral-700">Đang làm:</span>
                <span className="uppercase font-black bg-black text-[#fffdf5] px-1.5 py-0.2 text-[10px]">
                  {progress.lastActiveSection}
                </span>
              </span>
              <span className="text-amber-900 font-black">
                {progress.answeredCount}/{progress.totalCount} ({progressPercent}%)
              </span>
            </div>
            <div className="w-full h-2 border border-black bg-white overflow-hidden">
              <div
                className="h-full bg-amber-400 border-r border-black transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {stats && (
          <div className="mt-2.5 px-2.5 py-1.5 border border-neutral-300 bg-[#fcf8ed] text-xs font-mono text-neutral-800 flex items-center justify-between flex-wrap gap-1">
            <span suppressHydrationWarning className="font-semibold text-neutral-600 text-[11px]">
              Gần nhất: {new Date(stats.submittedAt).toLocaleDateString('vi-VN')}
            </span>
            <span className="font-bold text-black text-xs">
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
        <div className="pt-2 border-t-2 border-black space-y-2">
          {/* Primary High-Visibility Resume CTA Button */}
          <Link
            href={`/test/${testId}/${progress.lastActiveSection}`}
            className="w-full py-2.5 px-4 bg-amber-300 hover:bg-amber-400 text-black font-black text-sm border-2 border-black text-center flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer focus-visible:outline-2"
          >
            <span>▶ Tiếp tục làm ({progress.lastActiveSection.toUpperCase()}) &rarr;</span>
          </Link>

          {/* Secondary Subdued Actions Row */}
          <div className="flex items-center justify-between text-xs pt-0.5">
            {stats ? (
              <Link
                href={`/results/${stats.id}`}
                className="text-neutral-700 hover:text-black font-bold text-xs underline cursor-pointer"
              >
                Kết quả cũ ({stats.readingScore} R)
              </Link>
            ) : <span />}

            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Xóa tiến độ dở và làm lại từ đầu bài thi "${testTitle}"?`)) {
                  deleteTestProgress(testId);
                  router.push(`/test/${testId}/reading`);
                }
              }}
              className="text-neutral-500 hover:text-red-700 underline font-semibold text-xs cursor-pointer ml-auto"
              title="Xóa tiến độ dở và làm lại từ đầu"
            >
              Làm lại từ đầu
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="pt-2 border-t-2 border-black flex items-center gap-2">
        <Link
          href={`/test/${testId}`}
          className="flex-1 px-4 py-2.5 bg-black text-[#fffdf5] font-black text-sm border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors text-center inline-block cursor-pointer focus-visible:outline-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          Bắt đầu làm bài &rarr;
        </Link>
        {stats && (
          <Link
            href={`/results/${stats.id}`}
            className="px-3 py-2.5 bg-[#f4eed9] text-black font-bold text-xs border-2 border-black hover:bg-black hover:text-[#fffdf5] transition-colors text-center inline-block cursor-pointer focus-visible:outline-2 shrink-0"
            title="Xem lại kết quả bài nộp gần nhất"
          >
            Kết quả cũ
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
          <span className="font-black px-2 py-0.5 border-2 border-black bg-amber-300 text-black text-xs shadow-xs">
            ⚡ Đang dở: {progressPercent}% ({progress.lastActiveSection})
          </span>
        )}
        {stats && (
          <span className="font-bold px-2 py-0.5 border border-emerald-800 bg-emerald-100 text-emerald-950 text-xs">
            ✓ Đã nộp ({stats.count} lần)
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
              className="px-3.5 py-2 bg-amber-300 hover:bg-amber-400 text-black font-black text-xs border-2 border-black transition-colors text-center cursor-pointer shadow-xs"
            >
              ▶ Tiếp tục ({progress.lastActiveSection})
            </Link>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Xóa tiến độ dở của bài thi "${testTitle}"?`)) {
                  deleteTestProgress(testId);
                  router.push(`/test/${testId}/reading`);
                }
              }}
              className="px-2 py-2 text-xs font-semibold text-neutral-500 hover:text-red-700 underline cursor-pointer"
              title="Làm lại từ đầu"
            >
              Làm lại
            </button>
          </>
        ) : (
          <Link
            href={`/test/${testId}`}
            className="px-4 py-2 bg-black text-[#fffdf5] font-black text-xs border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors text-center cursor-pointer"
          >
            Làm bài &rarr;
          </Link>
        )}
        {stats && (
          <Link
            href={`/results/${stats.id}`}
            className="px-3 py-2 bg-[#fcf8ed] text-black font-bold text-xs border-2 border-black hover:bg-black hover:text-[#fffdf5] transition-colors text-center cursor-pointer"
          >
            Kết quả
          </Link>
        )}
      </div>
    );
  }

  return null;
};
