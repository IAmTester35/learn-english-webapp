import React from 'react';
import Link from 'next/link';
import { Plus, GraduationCap } from 'lucide-react';

interface TestCatalogOverviewProps {
  totalTests: number;
  inProgressCount?: number;
  completedCount?: number;
  attemptsCount?: number;
}

export const TestCatalogOverview: React.FC<TestCatalogOverviewProps> = ({ totalTests }) => {
  return (
    <section
      aria-label="Tổng quan hệ thống thi"
      className="border-2 border-black p-4 sm:p-5 bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full min-w-0"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <GraduationCap className="w-5 h-5 text-black shrink-0" />
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-black">
              Kho Đề Khảo Thí
            </h2>
            <span className="font-mono text-xs font-bold px-2 py-0.5 border-2 border-black bg-[#f4eed9]">
              {totalTests} đề
            </span>
          </div>

          <p className="text-xs sm:text-sm font-semibold text-neutral-700">
            Đánh giá năng lực chuẩn hóa CEFR (A2–C1) &amp; HSK (1–6).
          </p>
        </div>

        <div className="shrink-0 flex items-center">
          <Link
            href="/test/create"
            className="w-full sm:w-auto border-2 border-black px-3.5 py-2 bg-black text-[#fffdf5] font-black text-xs sm:text-sm hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Thêm đề mới</span>
          </Link>
        </div>
      </div>
    </section>
  );
};
