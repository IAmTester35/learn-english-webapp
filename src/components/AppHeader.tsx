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
    <header className="border-b-2 border-black bg-white sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className="text-left group cursor-pointer focus-visible:outline-2"
          >
            <h1 className="text-xl font-bold tracking-tight text-black flex items-center gap-2">
              <span className="inline-block w-4 h-4 bg-black"></span>
              ENGLISH TEST LAB
            </h1>
            <p className="text-xs text-neutral-600">Local Testing & Assessment Platform</p>
          </Link>
        </div>

        <nav aria-label="Điều hướng chính" className="flex items-center gap-2">
          <Link
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className={`px-4 py-2 text-sm font-semibold border-2 border-black transition-colors ${
              isCatalog
                ? 'bg-black text-white'
                : 'bg-white text-black hover:bg-neutral-100'
            }`}
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            Danh mục bài thi
          </Link>

          <Link
            href="/results"
            onClick={(e) => handleLinkClick(e, '/results')}
            className={`px-4 py-2 text-sm font-semibold border-2 border-black transition-colors flex items-center gap-2 ${
              isResults
                ? 'bg-black text-white'
                : 'bg-white text-black hover:bg-neutral-100'
            }`}
            aria-current={pathname === '/results' ? 'page' : undefined}
          >
            <span>Kết quả & Chấm bài</span>
            {totalAttemptsCount > 0 && (
              <span
                className={`text-xs px-1.5 py-0.5 border font-mono ${
                  isResults
                    ? 'border-white bg-white text-black font-bold'
                    : 'border-black bg-neutral-200 text-black font-bold'
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
