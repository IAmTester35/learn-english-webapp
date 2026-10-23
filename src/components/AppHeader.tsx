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
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [isHideOnMobile, setIsHideOnMobile] = React.useState(false);
  const lastScrollY = React.useRef(0);

  React.useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 30);

      // Auto-hide on mobile when scrolling down; reveal immediately when scrolling up or at top
      if (currentScrollY > 40 && currentScrollY > lastScrollY.current) {
        setIsHideOnMobile(true);
      } else {
        setIsHideOnMobile(false);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  const scrollToBottom = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth',
    });
  };

  const isCreate = pathname === '/test/create';
  const isTestPage = pathname.startsWith('/test') && !isCreate;
  const isCatalog = pathname === '/' || isTestPage;
  const isResults = pathname.startsWith('/results');

  return (
    <header
      className={`border-b-2 border-black bg-[#fffdf5] sticky top-0 z-50 w-full max-w-full overflow-x-clip transition-transform duration-300 ${
        isHideOnMobile ? '-translate-y-full md:translate-y-0' : 'translate-y-0'
      } ${isScrolled ? 'shadow-md' : 'shadow-sm'}`}
    >
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-1.5 sm:gap-4 w-full min-w-0">
        <div className="shrink-0 min-w-0">
          <Link
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className="text-left group cursor-pointer focus-visible:outline-2 block"
          >
            <h1 className="font-black tracking-tight text-black flex items-center gap-1.5 text-sm sm:text-lg">
              <span className="inline-block bg-black w-3 h-3 sm:w-4 sm:h-4 shrink-0"></span>
              <span className="truncate">L TestLab</span>
            </h1>
            <p className="text-[11px] sm:text-xs font-semibold text-neutral-800 hidden md:block">
              Nền tảng kiểm tra 4 kỹ năng
            </p>
          </Link>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Quick scroll to bottom button on test runner - visible on md+ screens; mobile uses floating bottom button */}
          {isTestPage && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="border-2 border-black bg-[#f4eed9] text-black font-bold hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer hidden md:flex items-center gap-1 shrink-0 px-2.5 py-1.5 text-xs"
              title="Cuộn nhanh xuống cuối bài thi để nộp hoặc chuyển phần"
            >
              <span className="font-mono text-sm leading-none">↓</span>
              <span>Xuống cuối trang</span>
            </button>
          )}

          <nav aria-label="Điều hướng chính" className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Link
              href="/"
              onClick={(e) => handleLinkClick(e, '/')}
              className={`border-2 border-black font-bold transition-colors cursor-pointer shrink-0 px-2 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm ${isCatalog
                  ? 'bg-black text-[#fffdf5]'
                  : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
                }`}
              aria-current={pathname === '/' ? 'page' : undefined}
            >
              <span className="hidden sm:inline">Danh mục bài thi</span>
              <span className="sm:hidden">Đề thi</span>
            </Link>

            <Link
              href="/results"
              onClick={(e) => handleLinkClick(e, '/results')}
              className={`border-2 border-black transition-colors flex items-center gap-1 cursor-pointer shrink-0 px-2 sm:px-4 py-1 sm:py-1.5 text-xs sm:text-sm font-bold ${isResults
                  ? 'bg-black text-[#fffdf5]'
                  : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
                }`}
              aria-current={pathname === '/results' ? 'page' : undefined}
            >
              <span className="hidden sm:inline">Kết quả & Chấm bài</span>
              <span className="sm:hidden">Kết quả</span>
              {totalAttemptsCount > 0 && (
                <span
                  className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.2 border font-mono font-bold ${isResults
                      ? 'border-[#fffdf5] bg-[#fffdf5] text-black'
                      : 'border-black bg-[#f4eed9] text-black'
                    }`}
                  title={`Tổng ${totalAttemptsCount} bài đã nộp, ${pendingReviewCount} bài chờ chấm`}
                >
                  {totalAttemptsCount}
                  {pendingReviewCount > 0 && (
                    <span className="hidden md:inline">{` (${pendingReviewCount})`}</span>
                  )}
                </span>
              )}
            </Link>

            <Link
              href="/test/create"
              onClick={(e) => handleLinkClick(e, '/test/create')}
              className={`border-2 border-black font-bold transition-colors cursor-pointer shrink-0 px-3 sm:px-4 py-1.5 text-xs sm:text-sm hidden sm:inline-flex items-center ${isCreate
                  ? 'bg-black text-[#fffdf5]'
                  : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
                }`}
              aria-current={isCreate ? 'page' : undefined}
            >
              <span>+ Thêm đề thi</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};
