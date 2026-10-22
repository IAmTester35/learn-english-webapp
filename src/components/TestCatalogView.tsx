'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { TestCatalog, TestCatalogItem } from '@/types/test';
import { useAttempts } from '@/hooks/useAttempts';

interface TestCatalogViewProps {
  catalog: TestCatalog;
}

type LevelFilter = 'all' | 'A2' | 'B1' | 'C1';
type StatusFilter = 'all' | 'completed' | 'not_started';
type SortOption = 'default' | 'id_asc' | 'id_desc' | 'title_asc';
type ViewMode = 'grid' | 'list';

function extractLevel(test: TestCatalogItem): 'A2' | 'B1' | 'C1' | 'Other' {
  const combined = (test.id + ' ' + test.title + ' ' + test.description).toUpperCase();
  if (combined.includes('A2') || combined.includes('KEY')) return 'A2';
  if (combined.includes('B1') || combined.includes('PET') || combined.includes('INTERMEDIATE')) return 'B1';
  if (combined.includes('C1') || combined.includes('CAE') || combined.includes('ADVANCED')) return 'C1';
  return 'Other';
}

export const TestCatalogView: React.FC<TestCatalogViewProps> = ({ catalog }) => {
  const attempts = useAttempts();

  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Map attempt statistics per testId
  const attemptsByTestId = useMemo(() => {
    const map = new Map<
      string,
      { count: number; lastSubmittedAt: string; latestReadingScore?: string; latestListeningScore?: string; latestAttemptId: string }
    >();
    attempts.forEach((att) => {
      const existing = map.get(att.testId);
      if (!existing) {
        map.set(att.testId, {
          count: 1,
          lastSubmittedAt: att.submittedAt,
          latestReadingScore: `${att.scores.reading.correctCount}/${att.scores.reading.totalCount}`,
          latestListeningScore: `${att.scores.listening.correctCount}/${att.scores.listening.totalCount}`,
          latestAttemptId: att.id,
        });
      } else {
        existing.count += 1;
      }
    });
    return map;
  }, [attempts]);

  const totalCompletedTests = attemptsByTestId.size;

  // Filter & sort logic
  const filteredTests = useMemo(() => {
    let result = [...catalog.tests];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    // Level filter
    if (levelFilter !== 'all') {
      result = result.filter((t) => extractLevel(t) === levelFilter);
    }

    // Status filter
    if (statusFilter === 'completed') {
      result = result.filter((t) => attemptsByTestId.has(t.id));
    } else if (statusFilter === 'not_started') {
      result = result.filter((t) => !attemptsByTestId.has(t.id));
    }

    // Sorting
    if (sortOption === 'id_asc') {
      result.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    } else if (sortOption === 'id_desc') {
      result.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    } else if (sortOption === 'title_asc') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [catalog.tests, searchQuery, levelFilter, statusFilter, sortOption, attemptsByTestId]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setLevelFilter('all');
    setStatusFilter('all');
    setSortOption('default');
  };

  return (
    <div className="space-y-6">
      {/* Dashboard & Overview Banner */}
      <section
        aria-label="Tổng quan hệ thống thi"
        className="border-2 border-black p-6 bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black pb-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-black flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-black inline-block"></span>
              Kho Đề Thi Tiếng Anh 4 Kỹ Năng
            </h2>
            <p className="text-sm font-semibold text-neutral-800 mt-1">
              Giao diện tối ưu bảo vệ mắt (giảm ánh sáng xanh), tương phản cao theo chuẩn WCAG AAA.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 font-mono text-xs font-bold shrink-0">
            <div className="border-2 border-black px-3 py-1.5 bg-[#f4eed9] text-center">
              <span className="block text-base font-black">{catalog.tests.length}</span>
              <span>Tổng số đề</span>
            </div>
            <div className="border-2 border-black px-3 py-1.5 bg-[#f4eed9] text-center">
              <span className="block text-base font-black">{totalCompletedTests}</span>
              <span>Đã làm</span>
            </div>
            <div className="border-2 border-black px-3 py-1.5 bg-[#f4eed9] text-center">
              <span className="block text-base font-black">{attempts.length}</span>
              <span>Lượt nộp bài</span>
            </div>
          </div>
        </div>

        {/* 4 Skills summary badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold font-mono">
          <div className="border-2 border-black p-2.5 bg-[#f4eed9] flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-black shrink-0"></span>
            <div>
              <span className="block font-black">READING</span>
              <span className="text-[11px] font-medium text-neutral-800">Chấm tức thì</span>
            </div>
          </div>
          <div className="border-2 border-black p-2.5 bg-[#f4eed9] flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-black shrink-0"></span>
            <div>
              <span className="block font-black">LISTENING</span>
              <span className="text-[11px] font-medium text-neutral-800">Âm thanh & Đáp án</span>
            </div>
          </div>
          <div className="border-2 border-black p-2.5 bg-[#f4eed9] flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-black shrink-0"></span>
            <div>
              <span className="block font-black">SPEAKING</span>
              <span className="text-[11px] font-medium text-neutral-800">Thu âm & Rubric</span>
            </div>
          </div>
          <div className="border-2 border-black p-2.5 bg-[#f4eed9] flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-black shrink-0"></span>
            <div>
              <span className="block font-black">WRITING</span>
              <span className="text-[11px] font-medium text-neutral-800">AI chấm tự động</span>
            </div>
          </div>
        </div>
      </section>

      {/* Scalable Search, Filter & View Controls Toolbar */}
      <section
        role="search"
        aria-label="Tìm kiếm và lọc đề thi"
        className="border-2 border-black p-4 bg-[#fffdf5] space-y-4"
      >
        {/* Search input + View switch */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <label htmlFor="test-search-input" className="sr-only">
              Tìm kiếm đề thi
            </label>
            <input
              id="test-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Tìm kiếm đề thi theo tên, mã đề (test-01), trình độ (A2, B1, C1)..."
              className="w-full px-3.5 py-2.5 border-2 border-black bg-[#fcf8ed] text-black font-semibold text-sm placeholder:text-neutral-700 placeholder:font-normal focus-visible:outline-2"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold px-2 py-0.5 bg-black text-[#fffdf5] hover:opacity-80"
                aria-label="Xóa từ khóa tìm kiếm"
              >
                Xóa
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Switcher */}
            <div className="flex border-2 border-black font-bold text-xs" role="group" aria-label="Chế độ hiển thị">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  viewMode === 'grid' ? 'bg-black text-[#fffdf5]' : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
                }`}
                aria-pressed={viewMode === 'grid'}
                title="Chế độ lưới (Grid)"
              >
                ⊞ Thẻ lưới
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 border-l-2 border-black cursor-pointer transition-colors ${
                  viewMode === 'list' ? 'bg-black text-[#fffdf5]' : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
                }`}
                aria-pressed={viewMode === 'list'}
                title="Chế độ danh sách (List)"
              >
                ☰ Danh sách
              </button>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="sort-select" className="text-xs font-bold text-black font-mono">
                Sắp xếp:
              </label>
              <select
                id="sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="px-2.5 py-2 border-2 border-black text-xs font-bold bg-[#fcf8ed] text-black cursor-pointer focus-visible:outline-2"
              >
                <option value="default">Mặc định</option>
                <option value="id_asc">Mã đề (A &rarr; Z)</option>
                <option value="id_desc">Mã đề (Z &rarr; A)</option>
                <option value="title_asc">Tiêu đề (A &rarr; Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Filter Pills row */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-black text-xs">
          {/* Level Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold font-mono text-black">Trình độ:</span>
            {(['all', 'A2', 'B1', 'C1'] as LevelFilter[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setLevelFilter(level)}
                className={`px-2.5 py-1 border-2 border-black font-bold cursor-pointer transition-colors ${
                  levelFilter === level
                    ? 'bg-black text-[#fffdf5]'
                    : 'bg-[#fcf8ed] text-black hover:bg-[#f4eed9]'
                }`}
                aria-pressed={levelFilter === level}
              >
                {level === 'all' ? 'Tất cả' : level}
              </button>
            ))}
          </div>

          <span className="hidden sm:inline text-neutral-400">|</span>

          {/* Status Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold font-mono text-black">Tiến độ:</span>
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'completed', label: 'Đã làm' },
              { id: 'not_started', label: 'Chưa làm' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id as StatusFilter)}
                className={`px-2.5 py-1 border-2 border-black font-bold cursor-pointer transition-colors ${
                  statusFilter === st.id
                    ? 'bg-black text-[#fffdf5]'
                    : 'bg-[#fcf8ed] text-black hover:bg-[#f4eed9]'
                }`}
                aria-pressed={statusFilter === st.id}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Active filter count / reset button */}
          {(searchQuery || levelFilter !== 'all' || statusFilter !== 'all' || sortOption !== 'default') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="ml-auto underline font-bold text-xs text-black hover:opacity-70 cursor-pointer"
            >
              &times; Đặt lại tất cả bộ lọc
            </button>
          )}
        </div>
      </section>

      {/* Results Count & Live Region for a11y */}
      <div className="flex items-center justify-between text-xs font-bold font-mono text-black" aria-live="polite">
        <span>
          Hiển thị <strong className="text-sm underline">{filteredTests.length}</strong> / {catalog.tests.length} bài thi
        </span>
        {searchQuery && (
          <span className="text-neutral-800">
            Từ khóa: &quot;{searchQuery}&quot;
          </span>
        )}
      </div>

      {/* Main Test List/Grid Section */}
      <section aria-labelledby="catalog-tests-heading">
        <h3 id="catalog-tests-heading" className="sr-only">
          Danh sách đề thi
        </h3>

        {filteredTests.length === 0 ? (
          <div className="border-2 border-black p-8 bg-[#fffdf5] text-center space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-base font-bold text-black">
              Không tìm thấy đề thi nào phù hợp với điều kiện tìm kiếm.
            </p>
            <p className="text-xs text-neutral-800">
              Hãy thử tìm kiếm với từ khóa khác hoặc bấm nút đặt lại bộ lọc bên dưới.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-2 bg-black text-[#fffdf5] font-bold text-sm border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View: Responsive 2-column on md+, easily scales to dozens of tests */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredTests.map((test) => {
              const level = extractLevel(test);
              const stats = attemptsByTestId.get(test.id);

              return (
                <article
                  key={test.id}
                  className="border-2 border-black p-5 bg-[#fffdf5] flex flex-col justify-between gap-4 transition-all hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5"
                >
                  <div className="space-y-3">
                    {/* Header tags: ID, Level, Status */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="font-bold px-2 py-0.5 border-2 border-black bg-[#f4eed9]">
                          {test.id}
                        </span>
                        <span className="font-bold px-2 py-0.5 border-2 border-black bg-black text-[#fffdf5]">
                          {level}
                        </span>
                      </div>

                      {stats ? (
                        <span className="text-xs font-bold font-mono px-2 py-0.5 border-2 border-black bg-[#e2dac0] text-black">
                          ✓ Đã làm ({stats.count} lần)
                        </span>
                      ) : (
                        <span className="text-xs font-semibold font-mono px-2 py-0.5 border border-black text-neutral-800">
                          Chưa bắt đầu
                        </span>
                      )}
                    </div>

                    {/* Test Title & Description */}
                    <div>
                      <h4 className="text-lg font-black tracking-tight text-black line-clamp-2">
                        {test.title}
                      </h4>
                      <p className="text-sm font-medium text-neutral-800 mt-1 line-clamp-3 leading-relaxed">
                        {test.description}
                      </p>
                    </div>

                    {/* 4 Skills Checklist Pills */}
                    <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] font-bold font-mono">
                      <span className="px-1.5 py-0.5 border border-black bg-[#fcf8ed]">📖 Reading</span>
                      <span className="px-1.5 py-0.5 border border-black bg-[#fcf8ed]">🎧 Listening</span>
                      <span className="px-1.5 py-0.5 border border-black bg-[#fcf8ed]">🎙️ Speaking</span>
                      <span className="px-1.5 py-0.5 border border-black bg-[#fcf8ed]">✍️ Writing</span>
                    </div>

                    {/* Past Performance Snapshot if available */}
                    {stats && (
                      <div className="p-2.5 border-2 border-black bg-[#fcf8ed] text-xs font-mono font-bold space-y-1">
                        <div className="flex items-center justify-between text-neutral-800 text-[11px]">
                          <span>Lần gần nhất:</span>
                          <span>{new Date(stats.lastSubmittedAt).toLocaleDateString('vi-VN')}</span>
                        </div>
                        <div className="flex items-center gap-3 text-black">
                          <span>Reading: <strong>{stats.latestReadingScore}</strong></span>
                          <span>&bull;</span>
                          <span>Listening: <strong>{stats.latestListeningScore}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t-2 border-black flex items-center gap-2">
                    <Link
                      href={`/test/${test.id}`}
                      className="flex-1 px-4 py-2.5 bg-black text-[#fffdf5] font-black text-sm border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors text-center inline-block cursor-pointer focus-visible:outline-2"
                    >
                      Bắt đầu làm bài &rarr;
                    </Link>

                    {stats && (
                      <Link
                        href={`/results/${stats.latestAttemptId}`}
                        className="px-3 py-2.5 bg-[#f4eed9] text-black font-bold text-xs border-2 border-black hover:bg-black hover:text-[#fffdf5] transition-colors text-center inline-block cursor-pointer focus-visible:outline-2"
                        title="Xem lại kết quả bài nộp gần nhất"
                      >
                        Xem kết quả
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          /* List View: Ultra compact for scrolling 50+ tests */
          <div className="border-2 border-black divide-y-2 divide-black bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {filteredTests.map((test) => {
              const level = extractLevel(test);
              const stats = attemptsByTestId.get(test.id);

              return (
                <article
                  key={test.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#fcf8ed] transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="font-bold px-2 py-0.5 border border-black bg-[#f4eed9]">
                        {test.id}
                      </span>
                      <span className="font-bold px-2 py-0.5 border border-black bg-black text-[#fffdf5]">
                        {level}
                      </span>
                      {stats && (
                        <span className="font-bold text-neutral-800">
                          ✓ Đã làm {stats.count} lần (Gần nhất: {stats.latestReadingScore} R / {stats.latestListeningScore} L)
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-black text-black truncate">{test.title}</h4>
                    <p className="text-xs font-medium text-neutral-800 line-clamp-1">{test.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {stats && (
                      <Link
                        href={`/results/${stats.latestAttemptId}`}
                        className="px-3 py-2 bg-[#f4eed9] text-black font-bold text-xs border-2 border-black hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer"
                      >
                        Kết quả cũ
                      </Link>
                    )}
                    <Link
                      href={`/test/${test.id}`}
                      className="px-4 py-2 bg-black text-[#fffdf5] font-bold text-xs border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer"
                    >
                      Làm bài &rarr;
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
