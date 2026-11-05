import React from 'react';
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
    </div>
  );
};
