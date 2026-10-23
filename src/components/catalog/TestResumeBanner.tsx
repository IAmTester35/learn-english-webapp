'use client';

import React from 'react';
import Link from 'next/link';
import type { TestProgressSummary } from '@/types/storage';
import { useTestProgress } from '@/hooks/useTestProgress';
import { deleteTestProgress } from '@/services/testProgressStorage';

interface TestResumeBannerProps {
  initialProgressList: TestProgressSummary[];
}

export const TestResumeBanner: React.FC<TestResumeBannerProps> = ({ initialProgressList }) => {
  const [isMounted, setIsMounted] = React.useState(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const clientProgress = useTestProgress();
  // Safe hydration: use server initialProgressList on first render, switch to clientProgress after mount
  const progressList = isMounted ? clientProgress : initialProgressList;

  if (!progressList || progressList.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Bài thi đang làm dở"
      className="border-2 border-black p-4 sm:p-5 bg-[#fff9e6] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] border-l-6 sm:border-l-8 border-l-amber-500 space-y-3.5 w-full min-w-0"
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black/80 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping shrink-0" />
          <span className="text-xs font-mono font-black uppercase tracking-wider bg-amber-300 text-black px-2 py-0.5 border-2 border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
            ⚡ Tiếp tục làm bài
          </span>
          <span className="text-xs font-mono font-bold text-neutral-800">
            {progressList.length} bài chưa nộp
          </span>
        </div>
        <p className="text-xs text-neutral-700 font-medium">
          Dữ liệu được lưu an toàn trên máy của bạn
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {progressList.map((prog) => {
          const percent = Math.round((prog.answeredCount / (prog.totalCount || 1)) * 100);
          return (
            <div
              key={prog.testId}
              className="border-2 border-black p-3.5 sm:p-4 bg-[#fffdf5] flex flex-col justify-between gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-white transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold px-1.5 py-0.2 border border-black bg-[#f4eed9] truncate max-w-[180px]">
                    {prog.testId}
                  </span>
                  <span suppressHydrationWarning className="text-[11px] font-mono font-semibold text-neutral-600 shrink-0">
                    {new Date(prog.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • {new Date(prog.updatedAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <h4 className="font-black text-sm sm:text-base text-black line-clamp-1">
                  {prog.testTitle}
                </h4>

                <div className="text-xs font-mono font-bold text-neutral-900 flex items-center justify-between pt-0.5">
                  <span className="flex items-center gap-1.5">
                    <span>Đang làm:</span>
                    <span className="uppercase font-black bg-black text-[#fffdf5] px-1.5 py-0.2 text-[10px]">
                      {prog.lastActiveSection}
                    </span>
                  </span>
                  <span className="text-amber-900 font-black">{percent}%</span>
                </div>

                {/* Vivid Progress Bar */}
                <div className="w-full h-2.5 border-2 border-black bg-white overflow-hidden">
                  <div
                    className="h-full bg-amber-400 border-r-2 border-black transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              {/* Action Buttons: Primary Full Width CTA + Subtle Destructive link */}
              <div className="space-y-2 pt-1 border-t border-neutral-300">
                <Link
                  href={`/test/${prog.testId}/${prog.lastActiveSection}`}
                  className="w-full py-2.5 px-4 bg-amber-300 hover:bg-amber-400 text-black font-black text-xs sm:text-sm border-2 border-black text-center flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <span>▶ Tiếp tục làm ({prog.lastActiveSection.toUpperCase()}) &rarr;</span>
                </Link>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Bạn có chắc muốn xóa bản lưu nháp của bài "${prog.testTitle}"?`)) {
                        deleteTestProgress(prog.testId);
                      }
                    }}
                    className="text-[11px] font-semibold text-neutral-600 hover:text-black underline cursor-pointer"
                    title="Xóa tiến độ bài thi này"
                  >
                    Hủy bản nháp này
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
