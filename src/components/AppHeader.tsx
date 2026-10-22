'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAttempts } from '@/hooks/useAttempts';
import { useNavigationGuard } from './NavigationGuard';

export const AppHeader: React.FC = () => {
  const pathname = usePathname();
  const attempts = useAttempts();
  const { confirmNavigation } = useNavigationGuard();

  const totalAttemptsCount = attempts.length;
  const pendingReviewCount = attempts.reduce((acc, att) => {
    const pendingSpeaking = att.speakingReviews.filter((r) => r.status === 'pending_review').length;
    const pendingWriting = att.writingReviews.filter((r) => r.status === 'pending_review').length;
    return acc + (pendingSpeaking > 0 || pendingWriting > 0 ? 1 : 0);
  }, 0);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, targetHref: string) => {
    if (pathname === targetHref) {
      e.preventDefault();
      return;
    }
    if (!confirmNavigation()) {
      e.preventDefault();
    }
  };

  const isCatalog = pathname === '/' || pathname.startsWith('/test');
  const isResults = pathname.startsWith('/results');

  return (
    <header className="border-b-2 border-black bg-[#fffdf5] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className="text-left group cursor-pointer focus-visible:outline-2 block"
          >
            <h1 className="text-xl font-black tracking-tight text-black flex items-center gap-2">
              <span className="inline-block w-4 h-4 bg-black"></span>
              ENGLISH TEST LAB
            </h1>
            <p className="text-xs font-semibold text-neutral-800">Nền tảng kiểm tra 4 kỹ năng &bull; A11y Warm Theme</p>
          </Link>
        </div>

        <nav aria-label="Điều hướng chính" className="flex items-center gap-2">
          <Link
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className={`px-4 py-2 text-sm font-bold border-2 border-black transition-colors cursor-pointer ${
              isCatalog
                ? 'bg-black text-[#fffdf5]'
                : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
            }`}
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            Danh mục bài thi
          </Link>

          <Link
            href="/results"
            onClick={(e) => handleLinkClick(e, '/results')}
            className={`px-4 py-2 text-sm font-bold border-2 border-black transition-colors flex items-center gap-2 cursor-pointer ${
              isResults
                ? 'bg-black text-[#fffdf5]'
                : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
            }`}
            aria-current={pathname === '/results' ? 'page' : undefined}
          >
            <span>Kết quả & Chấm bài</span>
            {totalAttemptsCount > 0 && (
              <span
                className={`text-xs px-2 py-0.5 border-2 font-mono font-bold ${
                  isResults
                    ? 'border-[#fffdf5] bg-[#fffdf5] text-black'
                    : 'border-black bg-[#f4eed9] text-black'
                }`}
                title={`Tổng ${totalAttemptsCount} bài đã nộp, ${pendingReviewCount} bài cần chấm`}
              >
                {totalAttemptsCount}
                {pendingReviewCount > 0 && ` (${pendingReviewCount} chờ chấm)`}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
};
