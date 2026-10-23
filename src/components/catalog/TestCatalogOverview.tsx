import React from 'react';
import Link from 'next/link';

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
      className="border-2 border-black p-5 sm:p-6 bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full min-w-0"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-3.5 h-3.5 bg-black inline-block shrink-0"></span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-black">
              Kho Đề Thi Tiếng Anh 4 Kỹ Năng
            </h2>
            <span className="font-mono text-xs font-bold px-2 py-0.5 border-2 border-black bg-[#f4eed9]">
              {totalTests} đề thi khả dụng
            </span>
          </div>

          <p className="text-xs sm:text-sm font-semibold text-neutral-800 leading-relaxed">
            Hệ thống đánh giá năng lực ngoại ngữ chuẩn hóa theo khung tham chiếu Châu Âu (CEFR) & Cambridge (A2, B1, B2, C1). Tích hợp phát audio tự động và chấm bài Writing thông minh bằng AI.
          </p>
        </div>

        <div className="shrink-0 hidden sm:flex items-center">
          <Link
            href="/test/create"
            className="w-full sm:w-auto border-2 border-black px-4 py-2.5 bg-black text-[#fffdf5] font-black text-xs sm:text-sm hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <span>➕</span>
            <span>Thêm đề thi mới</span>
          </Link>
        </div>
      </div>
    </section>
  );
};
