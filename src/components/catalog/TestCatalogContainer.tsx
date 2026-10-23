'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { TestCatalogItem } from '@/types/test';
import type { TestProgressSummary, TestAttemptSummary } from '@/types/storage';
import { useTestProgress } from '@/hooks/useTestProgress';
import { useAttempts } from '@/hooks/useAttempts';
import { TestCardProgressIsland } from './TestCardProgressIsland';

interface TestCatalogContainerProps {
  tests: TestCatalogItem[];
  initialProgressList: TestProgressSummary[];
  initialAttemptList: TestAttemptSummary[];
}

type LevelFilter = 'all' | 'A2' | 'B1' | 'B2' | 'C1';
type StatusFilter = 'all' | 'in_progress' | 'completed' | 'not_started';
type ViewMode = 'grid' | 'list';

function extractLevel(test: TestCatalogItem): 'A2' | 'B1' | 'B2' | 'C1' | 'Other' {
  const combined = (test.id + ' ' + test.title + ' ' + test.description).toUpperCase();
  if (combined.includes('A2') || combined.includes('KEY')) return 'A2';
  if (combined.includes('B2') || combined.includes('FCE') || combined.includes('FIRST')) return 'B2';
  if (combined.includes('B1') || combined.includes('PET') || combined.includes('INTERMEDIATE')) return 'B1';
  if (combined.includes('C1') || combined.includes('CAE') || combined.includes('ADVANCED')) return 'C1';
  return 'Other';
}

export const TestCatalogContainer: React.FC<TestCatalogContainerProps> = ({
  tests,
  initialProgressList,
  initialAttemptList,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const clientProgress = useTestProgress();
  const clientAttempts = useAttempts();

  // Safe hydration: use server initial lists on first render, switch to client state after mount
  const progressList = isMounted ? clientProgress : initialProgressList;
  const attemptsList = isMounted ? clientAttempts : initialAttemptList;

  // Index maps
  const progressMap = useMemo(() => {
    const map = new Map<string, TestProgressSummary>();
    progressList.forEach((p) => {
      map.set(p.testId, {
        testId: p.testId,
        testTitle: p.testTitle,
        lastActiveSection: p.lastActiveSection,
        updatedAt: p.updatedAt,
        answeredCount: p.answeredCount,
        totalCount: p.totalCount,
      });
    });
    return map;
  }, [progressList]);

  const attemptMap = useMemo(() => {
    const map = new Map<string, TestAttemptSummary>();
    attemptsList.forEach((att) => {
      if (!map.has(att.testId)) {
        if ('scores' in att) {
          // Full attempt from client
          map.set(att.testId, {
            id: att.id,
            testId: att.testId,
            testTitle: att.testTitle,
            submittedAt: att.submittedAt,
            readingScore: `${att.scores.reading.correctCount}/${att.scores.reading.totalCount}`,
            listeningScore: `${att.scores.listening.correctCount}/${att.scores.listening.totalCount}`,
          });
        } else {
          // Summary from server
          map.set(att.testId, att as TestAttemptSummary);
        }
      }
    });
    return map;
  }, [attemptsList]);

  // Filter tests
  const filteredTests = useMemo(() => {
    let result = [...tests];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    if (levelFilter !== 'all') {
      result = result.filter((t) => extractLevel(t) === levelFilter);
    }

    if (statusFilter === 'in_progress') {
      result = result.filter((t) => progressMap.has(t.id));
    } else if (statusFilter === 'completed') {
      result = result.filter((t) => attemptMap.has(t.id));
    } else if (statusFilter === 'not_started') {
      result = result.filter((t) => !attemptMap.has(t.id) && !progressMap.has(t.id));
    }

    result.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return result;
  }, [tests, searchQuery, levelFilter, statusFilter, progressMap, attemptMap]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setLevelFilter('all');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Toolbar */}
      <section
        role="search"
        aria-label="Tìm kiếm và lọc đề thi"
        className="border-2 border-black p-4 bg-[#fffdf5] space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
      >
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
              placeholder="🔍 Tìm kiếm đề thi theo tên, mã đề (a2-key-01), trình độ (A2, B1, B2, C1)..."
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
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-black text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold font-mono text-black">Trình độ:</span>
            {(['all', 'A2', 'B1', 'B2', 'C1'] as LevelFilter[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setLevelFilter(level)}
                className={`px-2.5 py-1 border-2 border-black font-bold cursor-pointer transition-colors ${
                  levelFilter === level ? 'bg-black text-[#fffdf5]' : 'bg-[#fcf8ed] text-black hover:bg-[#f4eed9]'
                }`}
                aria-pressed={levelFilter === level}
              >
                {level === 'all' ? 'Tất cả' : level}
              </button>
            ))}
          </div>

          <span className="hidden sm:inline text-neutral-400">|</span>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold font-mono text-black">Tiến độ:</span>
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'in_progress', label: `Đang làm dở (${progressMap.size})` },
              { id: 'completed', label: `Đã nộp (${attemptMap.size})` },
              { id: 'not_started', label: 'Chưa làm' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id as StatusFilter)}
                className={`px-2.5 py-1 border-2 border-black font-bold cursor-pointer transition-colors ${
                  statusFilter === st.id ? 'bg-black text-[#fffdf5]' : 'bg-[#fcf8ed] text-black hover:bg-[#f4eed9]'
                }`}
                aria-pressed={statusFilter === st.id}
              >
                {st.label}
              </button>
            ))}
          </div>

          {(searchQuery || levelFilter !== 'all' || statusFilter !== 'all') && (
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

      {/* Results Count Counter */}
      <div className="flex items-center justify-between text-xs font-bold font-mono text-black" aria-live="polite">
        <span>
          Hiển thị <strong className="text-sm underline">{filteredTests.length}</strong> / {tests.length} bài thi
        </span>
        {searchQuery && (
          <span className="text-neutral-800">
            Từ khóa: &quot;{searchQuery}&quot;
          </span>
        )}
      </div>

      {/* Test List / Grid */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredTests.map((test) => {
              const level = extractLevel(test);
              const initialProg = progressMap.get(test.id);
              const initialStat = attemptMap.get(test.id);

              return (
                <article
                  key={test.id}
                  className={`border-2 border-black p-5 flex flex-col justify-between gap-4 transition-all hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 ${
                    initialProg
                      ? 'bg-[#fffcf0] border-l-6 sm:border-l-8 border-l-amber-500 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                      : 'bg-[#fffdf5]'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="font-bold px-2 py-0.5 border-2 border-black bg-[#f4eed9]">
                          {test.id}
                        </span>
                        <span className="font-bold px-2 py-0.5 border-2 border-black bg-black text-[#fffdf5]">
                          {level}
                        </span>
                      </div>
                      <TestCardProgressIsland
                        testId={test.id}
                        testTitle={test.title}
                        mode="badge"
                        initialProgress={initialProg}
                        initialStats={initialStat}
                      />
                    </div>

                    <div>
                      <h4 className="text-lg font-black tracking-tight text-black line-clamp-2">
                        {test.title}
                      </h4>
                      <p className="text-sm font-medium text-neutral-800 mt-1 line-clamp-3 leading-relaxed">
                        {test.description}
                      </p>
                      <TestCardProgressIsland
                        testId={test.id}
                        testTitle={test.title}
                        mode="body"
                        initialProgress={initialProg}
                        initialStats={initialStat}
                      />
                    </div>
                  </div>

                  <TestCardProgressIsland
                    testId={test.id}
                    testTitle={test.title}
                    mode="actions"
                    initialProgress={initialProg}
                    initialStats={initialStat}
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="border-2 border-black divide-y-2 divide-black bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {filteredTests.map((test) => {
              const level = extractLevel(test);
              const initialProg = progressMap.get(test.id);
              const initialStat = attemptMap.get(test.id);

              return (
                <article
                  key={test.id}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    initialProg ? 'bg-[#fffcf0] border-l-4 border-l-amber-500' : 'hover:bg-[#fcf8ed]'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
                      <span className="font-bold px-2 py-0.5 border border-black bg-[#f4eed9]">
                        {test.id}
                      </span>
                      <span className="font-bold px-2 py-0.5 border border-black bg-black text-[#fffdf5]">
                        {level}
                      </span>
                      <TestCardProgressIsland
                        testId={test.id}
                        testTitle={test.title}
                        mode="list_badge"
                        initialProgress={initialProg}
                        initialStats={initialStat}
                      />
                    </div>

                    <h4 className="font-black text-base text-black truncate">{test.title}</h4>
                    <p className="text-xs text-neutral-800 line-clamp-2">{test.description}</p>
                  </div>

                  <TestCardProgressIsland
                    testId={test.id}
                    testTitle={test.title}
                    mode="list_actions"
                    initialProgress={initialProg}
                    initialStats={initialStat}
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
