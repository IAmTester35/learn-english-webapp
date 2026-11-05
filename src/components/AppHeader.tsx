'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Award, ArrowDown, ShieldCheck } from 'lucide-react';
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
  const isAdmin = pathname.startsWith('/admin') || isCreate;
  const isTestPage = pathname.startsWith('/test') && !isCreate;
  const isCatalog = (pathname === '/' || isTestPage) && !isAdmin;
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
            <h1 className="font-black tracking-tight text-black flex items-center gap-1.5 text-sm sm:text-base">
              <span className="inline-block bg-black w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0"></span>
              <span className="truncate">L TestLab</span>
            </h1>
          </Link>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Quick scroll to bottom button on test runner */}
          {isTestPage && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="border-2 border-black bg-[#f4eed9] text-black font-bold hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer hidden md:flex items-center gap-1 shrink-0 px-2.5 py-1.5 text-xs"
              title="Cuộn xuống cuối trang"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Xuống cuối</span>
            </button>
          )}

          <nav aria-label="Điều hướng chính" className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <Link
              href="/"
              onClick={(e) => handleLinkClick(e, '/')}
              className={`border-2 border-black font-bold transition-colors cursor-pointer shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm flex items-center gap-1.5 ${isCatalog
                  ? 'bg-black text-[#fffdf5]'
                  : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
                }`}
              aria-current={pathname === '/' ? 'page' : undefined}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>Đề thi</span>
            </Link>

            <Link
              href="/results"
              onClick={(e) => handleLinkClick(e, '/results')}
              className={`border-2 border-black transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold ${isResults
                  ? 'bg-black text-[#fffdf5]'
                  : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
                }`}
              aria-current={pathname === '/results' ? 'page' : undefined}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>Kết quả</span>
              {totalAttemptsCount > 0 && (
                <span
                  className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.2 border font-mono font-bold ${isResults
                      ? 'border-[#fffdf5] bg-[#fffdf5] text-black'
                      : 'border-black bg-[#f4eed9] text-black'
                    }`}
                  title={`Tổng ${totalAttemptsCount} bài đã nộp`}
                >
                  {totalAttemptsCount}
                </span>
              )}
            </Link>

            <Link
              href="/admin"
              prefetch={false}
              onClick={(e) => handleLinkClick(e, '/admin')}
              className={`border-2 border-black font-bold transition-colors cursor-pointer shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm inline-flex items-center gap-1.5 ${isAdmin
                  ? 'bg-black text-[#fffdf5]'
                  : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
                }`}
              aria-current={isAdmin ? 'page' : undefined}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Quản trị</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};
