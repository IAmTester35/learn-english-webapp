import React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

interface TestCatalogOverviewProps {
  totalTests: number;
}

export const TestCatalogOverview: React.FC<TestCatalogOverviewProps> = ({ totalTests }) => {
  return (
    <div className="flex items-center justify-between gap-3 border-2 border-black p-3.5 sm:p-4 bg-[#fffdf5] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center gap-2">
        <h2 className="text-base sm:text-lg font-black tracking-tight text-black">
          Kho đề thi
        </h2>
        <span className="font-mono text-xs font-bold px-2 py-0.5 border border-black bg-[#f4eed9]">
          {totalTests}
        </span>
      </div>

      <Link
        href="/test/create"
        className="border-2 border-black px-3 py-1.5 bg-black text-[#fffdf5] font-bold text-xs sm:text-sm hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      >
        <Plus className="w-3.5 h-3.5 shrink-0" />
        <span>Thêm đề</span>
      </Link>
    </div>
  );
};
