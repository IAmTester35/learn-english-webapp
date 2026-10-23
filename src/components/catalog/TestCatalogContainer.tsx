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

export type LanguageFilter = 'all' | 'en' | 'zh';
export type LevelFilter = string;
export type StatusFilter = 'all' | 'in_progress' | 'completed' | 'not_started';
export type ViewMode = 'grid' | 'list';

export interface TestLanguageInfo {
  language: 'en' | 'zh';
  label: string;
  flag: string;
  level: string;
}

export function getTestLanguageInfo(test: TestCatalogItem): TestLanguageInfo {
  const isChinese =
    test.id.toLowerCase().startsWith('hsk') ||
    /[\u4e00-\u9fa5]/.test(test.title) ||
    /[\u4e00-\u9fa5]/.test(test.description);

  if (isChinese) {
    const combined = (test.id + ' ' + test.title + ' ' + test.description).toUpperCase();
    let level = 'HSK';
    const hskMatch = combined.match(/HSK[\s_-]*([1-6])|([1-6])\s*级/i);
    if (hskMatch) {
      level = `HSK ${hskMatch[1] || hskMatch[2]}`;
    }
    return {
      language: 'zh',
      label: 'Tiếng Trung',
      flag: '🇨🇳',
      level,
    };
  }

  // English
  const combined = (test.id + ' ' + test.title + ' ' + test.description).toUpperCase();
  let level = 'CEFR';
  if (combined.includes('A2') || combined.includes('KEY')) level = 'A2';
  else if (combined.includes('B2') || combined.includes('FCE') || combined.includes('FIRST')) level = 'B2';
  else if (combined.includes('B1') || combined.includes('PET') || combined.includes('INTERMEDIATE')) level = 'B1';
  else if (combined.includes('C1') || combined.includes('CAE') || combined.includes('ADVANCED')) level = 'C1';

  return {
    language: 'en',
    label: 'Tiếng Anh',
    flag: '🇬🇧',
    level,
  };
}

export const TestCatalogContainer: React.FC<TestCatalogContainerProps> = ({
  tests,
  initialProgressList,
  initialAttemptList,
}) => {
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('all');
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

  // Language counts
  const counts = useMemo(() => {
    let en = 0;
    let zh = 0;
    for (const t of tests) {
      const info = getTestLanguageInfo(t);
      if (info.language === 'en') en++;
      else if (info.language === 'zh') zh++;
    }
    return { all: tests.length, en, zh };
  }, [tests]);

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
          map.set(att.testId, {
            id: att.id,
            testId: att.testId,
            testTitle: att.testTitle,
            submittedAt: att.submittedAt,
            readingScore: `${att.scores.reading.correctCount}/${att.scores.reading.totalCount}`,
            listeningScore: `${att.scores.listening.correctCount}/${att.scores.listening.totalCount}`,
          });
        } else {
          map.set(att.testId, att as TestAttemptSummary);
        }
      }
    });
    return map;
  }, [attemptsList]);

  // Contextual Level Filter options
  const availableLevels = useMemo(() => {
    if (languageFilter === 'en') {
      return ['all', 'A2', 'B1', 'B2', 'C1'];
    }
    if (languageFilter === 'zh') {
      return ['all', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
    }
    return ['all', 'A2', 'B1', 'B2', 'C1', 'HSK 2'];
  }, [languageFilter]);

  const handleLanguageChange = (lang: LanguageFilter) => {
    setLanguageFilter(lang);
    setLevelFilter('all');
  };

  // Filter tests
  const filteredTests = useMemo(() => {
    let result = [...tests];

    // 1. Language Filter
    if (languageFilter !== 'all') {
      result = result.filter((t) => getTestLanguageInfo(t).language === languageFilter);
    }

    // 2. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    // 3. Level Filter
    if (levelFilter !== 'all') {
      result = result.filter((t) => getTestLanguageInfo(t).level === levelFilter);
    }

    // 4. Status Filter
    if (statusFilter === 'in_progress') {
      result = result.filter((t) => progressMap.has(t.id));
    } else if (statusFilter === 'completed') {
      result = result.filter((t) => attemptMap.has(t.id));
    } else if (statusFilter === 'not_started') {
      result = result.filter((t) => !attemptMap.has(t.id) && !progressMap.has(t.id));
    }

    result.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return result;
  }, [tests, languageFilter, searchQuery, levelFilter, statusFilter, progressMap, attemptMap]);

  const handleResetFilters = () => {
    setLanguageFilter('all');
    setSearchQuery('');
    setLevelFilter('all');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-6">
      {/* 1. Primary Language Segmented Tabs */}
      <section aria-label="Lựa chọn ngôn ngữ bài thi" className="w-full">
        <div className="flex border-2 border-black bg-[#f4eed9] p-1 gap-1.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex-wrap sm:flex-nowrap">
          {[
            { id: 'all', label: 'Tất cả ngôn ngữ', count: counts.all, flag: '🌐' },
            { id: 'en', label: 'Tiếng Anh (CEFR)', count: counts.en, flag: '🇬🇧' },
            { id: 'zh', label: 'Tiếng Trung (HSK)', count: counts.zh, flag: '🇨🇳' },
          ].map((tab) => {
            const isActive = languageFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleLanguageChange(tab.id as LanguageFilter)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 font-black text-xs sm:text-sm border-2 transition-all cursor-pointer select-none ${
                  isActive
                    ? 'bg-black text-[#fffdf5] border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] -translate-y-0.5'
                    : 'bg-[#fffdf5] text-black border-transparent hover:border-black hover:bg-[#fffcf0]'
                }`}
                aria-pressed={isActive}
              >
                <span className="text-base sm:text-lg shrink-0">{tab.flag}</span>
                <span className="truncate">{tab.label}</span>
                <span
                  className={`font-mono text-xs px-2 py-0.5 border shrink-0 ${
                    isActive
                      ? 'border-[#fffdf5] bg-neutral-800 text-[#fffdf5]'
                      : 'border-black bg-[#f4eed9] text-black'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Search and Contextual Filters Toolbar */}
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
              placeholder={
                languageFilter === 'zh'
                  ? '🔍 Tìm kiếm đề thi HSK theo tên, mã đề (hsk2-test-01), chủ đề...'
                  : languageFilter === 'en'
                  ? '🔍 Tìm kiếm đề thi Tiếng Anh theo tên, mã đề (a2-key-01), trình độ (B1, B2)...'
                  : '🔍 Tìm kiếm đề thi theo tên, mã đề, trình độ (A2, B1, B2, C1, HSK)...'
              }
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
            <span className="font-bold font-mono text-black">
              {languageFilter === 'zh' ? 'Cấp độ HSK:' : languageFilter === 'en' ? 'Trình độ CEFR:' : 'Trình độ:'}
            </span>
            {availableLevels.map((level) => (
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
              { id: 'in_progress', label: `Đang làm (${progressMap.size})` },
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

          {(searchQuery || levelFilter !== 'all' || statusFilter !== 'all' || languageFilter !== 'all') && (
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
          {languageFilter !== 'all' && (
            <span className="ml-1 text-neutral-800">
              ({languageFilter === 'zh' ? '🇨🇳 Tiếng Trung' : '🇬🇧 Tiếng Anh'})
            </span>
          )}
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
              Hãy thử chọn tab ngôn ngữ khác hoặc bấm nút đặt lại bộ lọc bên dưới.
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
              const langInfo = getTestLanguageInfo(test);
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
                      <div className="flex items-center gap-1.5 font-mono text-xs flex-wrap">
                        {/* Language & Level Badges */}
                        <span className="font-bold px-2 py-0.5 border-2 border-black bg-[#f4eed9] text-black flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                          <span>{langInfo.flag}</span>
                          <span>{langInfo.label}</span>
                        </span>
                        <span className="font-bold px-2 py-0.5 border-2 border-black bg-black text-[#fffdf5]">
                          {langInfo.level}
                        </span>
                        <span className="font-bold px-1.5 py-0.5 border border-neutral-400 bg-neutral-100 text-neutral-800 text-[11px]">
                          {test.id}
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
              const langInfo = getTestLanguageInfo(test);
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
                      <span className="font-bold px-2 py-0.5 border border-black bg-[#f4eed9] text-black flex items-center gap-1">
                        <span>{langInfo.flag}</span>
                        <span>{langInfo.label}</span>
                      </span>
                      <span className="font-bold px-2 py-0.5 border border-black bg-black text-[#fffdf5]">
                        {langInfo.level}
                      </span>
                      <span className="font-bold px-1.5 py-0.5 border border-neutral-400 bg-neutral-100 text-neutral-800 text-[11px]">
                        {test.id}
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
