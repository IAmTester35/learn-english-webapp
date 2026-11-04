'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Play, ArrowRight, Trash2 } from 'lucide-react';
import type { TestProgressSummary } from '@/types/storage';
import { useTestProgress } from '@/hooks/useTestProgress';
import { deleteTestProgress } from '@/services/testProgressStorage';

interface TestResumeBannerProps {
  initialProgressList: TestProgressSummary[];
}

const emptySubscribe = () => () => {};

export const TestResumeBanner: React.FC<TestResumeBannerProps> = ({ initialProgressList }) => {
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const clientProgress = useTestProgress();
  const progressList = isMounted ? clientProgress : initialProgressList;

  if (!progressList || progressList.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Đang làm dở"
      className="border-2 border-black p-3.5 sm:p-4 bg-[#fff9e6] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] border-l-4 border-l-amber-500 space-y-3 w-full min-w-0"
    >
      <div className="flex items-center justify-between text-xs font-bold font-mono">
        <span className="text-amber-950 uppercase tracking-wider">
          Đang làm dở ({progressList.length})
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {progressList.map((prog) => {
          const percent = Math.round((prog.answeredCount / (prog.totalCount || 1)) * 100);
          return (
            <div
              key={prog.testId}
              className="border-2 border-black p-3 bg-[#fffdf5] flex flex-col justify-between gap-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="font-bold px-1.5 py-0.2 border border-black bg-[#f4eed9] truncate max-w-45">
                    {prog.testId}
                  </span>
                  <span className="text-amber-900 font-bold">{percent}%</span>
                </div>

                <h4 className="font-bold text-sm text-black truncate">
                  {prog.testTitle}
                </h4>

                <div className="w-full h-1.5 border border-black bg-white overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-200">
                <Link
                  href={`/test/${prog.testId}/${prog.lastActiveSection}`}
                  prefetch={true}
                  className="px-3 py-1.5 bg-amber-300 hover:bg-amber-400 text-black font-bold text-xs border border-black flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Tiếp tục</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Xóa tiến độ của "${prog.testTitle}"?`)) {
                      deleteTestProgress(prog.testId);
                    }
                  }}
                  className="text-xs text-neutral-500 hover:text-red-700 underline cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Xóa</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
