'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pause,
  Trash2,
  Send,
  ArrowDown,
  Info,
  BookOpen,
  Headphones,
  FileText,
} from 'lucide-react';
import type {
  TestDocument,
  UserAnswers,
  Question,
  MultipleChoiceQuestion,
  MultipleSelectQuestion,
  FillBlankQuestion,
  TrueFalseNgQuestion,
} from '@/types/test';
import { gradeTestAttempt } from '@/domain/grader';
import { saveNewAttempt } from '@/services/attemptStorage';
import {
  getProgressByTestId,
  saveTestProgress,
  deleteTestProgress,
  calculateProgressStats,
} from '@/services/testProgressStorage';
import { useNavigationGuard } from './NavigationGuard';
import {
  ListeningAudioProvider,
  ListeningAudioPlayer,
  StickyListeningMiniPlayer,
} from './ListeningAudioPlayer';

type SkillTab = 'reading' | 'listening';

interface TestRunnerViewProps {
  test: TestDocument;
  aiEnabled?: boolean;
  initialSection?: string;
}

const ACTIVE_SKILL_TABS: SkillTab[] = ['reading', 'listening'];
const TAB_LABELS: Record<SkillTab, string> = {
  reading: 'Reading',
  listening: 'Listening',
};

const TAB_ICONS: Record<SkillTab, React.ReactNode> = {
  reading: <BookOpen className="w-3.5 h-3.5 shrink-0" />,
  listening: <Headphones className="w-3.5 h-3.5 shrink-0" />,
};

export function formatSectionTitle(prefix: string, index: number, rawTitle?: string): string {
  const trimmed = (rawTitle || '').trim();
  const cleaned = trimmed
    .replace(
      new RegExp(
        `^(?:${prefix}|Passage|Part|Task|Section|Topic|Conversation)\\s*\\d*\\s*[:\\-–—.]?\\s*`,
        'i'
      ),
      ''
    )
    .trim();

  if (cleaned) {
    return `${prefix} ${index}: ${cleaned}`;
  }
  return trimmed || `${prefix} ${index}`;
}

export const TestRunnerView: React.FC<TestRunnerViewProps> = ({ test, initialSection }) => {
  const router = useRouter();
  const { setIsTestInProgress } = useNavigationGuard();

  const [activeTab, setActiveTab] = useState<SkillTab>(
    initialSection === 'listening' ? 'listening' : 'reading'
  );
  const [answers, setAnswers] = useState<UserAnswers>({
    reading: {},
    listening: {},
    speaking: {},
    writing: {},
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lastSavedNotice, setLastSavedNotice] = useState<string>('');
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<string, boolean>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleTranscript = (partId: string) => {
    setExpandedTranscripts((prev) => ({
      ...prev,
      [partId]: !prev[partId],
    }));
  };

  // Pre-calculate sequential 1-based question numbers for clean UI display
  const questionNumberMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    let rCount = 1;
    test.sections.reading?.passages?.forEach((p) => {
      p.questions?.forEach((q) => {
        map[q.id] = rCount++;
      });
    });
    let lCount = 1;
    test.sections.listening?.parts?.forEach((part) => {
      part.questions?.forEach((q) => {
        map[q.id] = lCount++;
      });
    });
    return map;
  }, [test]);

  // Restore saved progress on mount & initialize navigation guard
  useEffect(() => {
    const existing = getProgressByTestId(test.id);

    if (existing) {
      const stats = calculateProgressStats(test, existing.answers);
      const hasAnswers = stats.answeredCount > 0;
      setIsTestInProgress(hasAnswers);

      queueMicrotask(() => {
        setAnswers(existing.answers);
        if (initialSection && ACTIVE_SKILL_TABS.includes(initialSection as SkillTab)) {
          setActiveTab(initialSection as SkillTab);
        } else {
          const targetSection = ACTIVE_SKILL_TABS.includes(existing.lastActiveSection as SkillTab)
            ? (existing.lastActiveSection as SkillTab)
            : 'reading';
          setActiveTab(targetSection);
          window.history.replaceState(null, '', `/test/${test.id}/${targetSection}`);
        }
        if (hasAnswers) {
          setLastSavedNotice(
            `Đã khôi phục tiến độ lưu lúc ${new Date(existing.updatedAt).toLocaleTimeString('vi-VN')}`
          );
        }
      });
    } else {
      setIsTestInProgress(false);
      if (!initialSection || !ACTIVE_SKILL_TABS.includes(initialSection as SkillTab)) {
        window.history.replaceState(null, '', `/test/${test.id}/reading`);
      }
    }

    return () => {
      setIsTestInProgress(false);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [test, initialSection, setIsTestInProgress]);

  // Handle browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1] as SkillTab;
      if (ACTIVE_SKILL_TABS.includes(lastPart)) {
        setActiveTab(lastPart);
      } else {
        setActiveTab('reading');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const persistDraft = (updatedAnswers: UserAnswers, currentTab: SkillTab) => {
    const stats = calculateProgressStats(test, updatedAnswers);
    if (stats.answeredCount === 0) {
      deleteTestProgress(test.id);
      setIsTestInProgress(false);
      setLastSavedNotice('');
      return;
    }
    setIsTestInProgress(true);
    const now = new Date().toISOString();
    saveTestProgress({
      testId: test.id,
      testTitle: test.title,
      lastActiveSection: currentTab,
      answers: updatedAnswers,
      updatedAt: now,
      answeredCount: stats.answeredCount,
      totalCount: stats.totalCount,
    });
    setLastSavedNotice(`Đã lưu nội bộ lúc ${new Date(now).toLocaleTimeString('vi-VN')}`);
  };

  const currentFlowIndex = ACTIVE_SKILL_TABS.indexOf(activeTab);
  const hasNextTab = currentFlowIndex >= 0 && currentFlowIndex < ACTIVE_SKILL_TABS.length - 1;
  const nextTab = hasNextTab ? ACTIVE_SKILL_TABS[currentFlowIndex + 1] : null;
  const hasPrevTab = currentFlowIndex > 0;
  const prevTab = hasPrevTab ? ACTIVE_SKILL_TABS[currentFlowIndex - 1] : null;

  const handleGoToTab = (tab: SkillTab) => {
    if (!ACTIVE_SKILL_TABS.includes(tab)) {
      return;
    }
    setActiveTab(tab);
    window.history.replaceState(null, '', `/test/${test.id}/${tab}`);
    persistDraft(answers, tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSingleAnswerChange = (section: 'reading' | 'listening', qId: string, value: string) => {
    const updated: UserAnswers = {
      ...answers,
      [section]: {
        ...answers[section],
        [qId]: value,
      },
    };
    setAnswers(updated);
    persistDraft(updated, activeTab);
  };

  const handleMultipleSelectChange = (
    section: 'reading' | 'listening',
    qId: string,
    optionId: string
  ) => {
    const currentList = (answers[section][qId] as string[]) || [];
    const exists = currentList.includes(optionId);
    const updatedList = exists
      ? currentList.filter((item) => item !== optionId)
      : [...currentList, optionId];
    const updated: UserAnswers = {
      ...answers,
      [section]: {
        ...answers[section],
        [qId]: updatedList,
      },
    };
    setAnswers(updated);
    persistDraft(updated, activeTab);
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handlePauseAndExit = () => {
    persistDraft(answers, activeTab);
    setIsTestInProgress(false);
    stopAudio();
    router.push('/');
  };

  const handleDiscardAndExit = () => {
    const stats = calculateProgressStats(test, answers);
    if (stats.answeredCount > 0) {
      const ok = window.confirm(
        'Bạn có chắc chắn muốn hủy bài làm này và quay về trang chủ? Toàn bộ câu trả lời chưa nộp của đề này sẽ bị xóa khỏi bộ nhớ.'
      );
      if (!ok) return;
    }
    deleteTestProgress(test.id);
    setIsTestInProgress(false);
    stopAudio();
    router.push('/');
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const confirmed = window.confirm(
      'Bạn có chắc chắn muốn nộp bài thi không?\n\n- Toàn bộ kết quả Reading & Listening sẽ được chấm điểm ngay lập tức.'
    );
    if (!confirmed) return;

    stopAudio();
    setIsSubmitting(true);
    try {
      // Chấm ngay các phần trắc nghiệm và khởi tạo attempt có đầy đủ bài viết của thí sinh
      const attempt = gradeTestAttempt(test, answers);

      // Lưu kết quả ngay lập tức vào LocalStorage để không bao giờ bị mất bài khi reload/mất mạng
      saveNewAttempt(attempt);
      deleteTestProgress(test.id);
      setIsTestInProgress(false);

      // Chuyển ngay sang trang kết quả - không block UI để chờ AI
      router.push(`/results/${attempt.id}`);
    } catch (err) {
      console.error('Lỗi khi nộp bài:', err);
      setIsSubmitting(false);
      alert('Đã xảy ra lỗi khi lưu kết quả bài thi. Vui lòng thử lại!');
    }
  };

  const renderQuestion = (q: Question, section: 'reading' | 'listening') => {
    const rawVal = answers[section][q.id];
    const qNumber = questionNumberMap[q.id] || 1;

    switch (q.type) {
      case 'multiple_choice': {
        const mcq = q as MultipleChoiceQuestion;
        const currentSelected = typeof rawVal === 'string' ? rawVal : '';
        return (
          <fieldset key={q.id} className="border-2 border-black p-4 space-y-3 bg-[#fffdf5]">
            <legend className="font-bold text-sm px-2 border-2 border-black bg-[#f4eed9] text-black">
              Câu hỏi {qNumber}
            </legend>
            <p className="font-semibold text-black">{mcq.prompt}</p>
            <div className="space-y-2 pt-1">
              {mcq.options.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-2.5 border-2 cursor-pointer transition-colors ${currentSelected === opt.id
                    ? 'border-black bg-black text-[#fffdf5] font-bold'
                    : 'border-black hover:bg-[#f4eed9] bg-[#fffdf5] text-black'
                    }`}
                >
                  <input
                    type="radio"
                    name={`${section}_${q.id}`}
                    value={opt.id}
                    checked={currentSelected === opt.id}
                    onChange={() => handleSingleAnswerChange(section, q.id, opt.id)}
                    className="mt-1 accent-black"
                  />
                  <span>
                    <strong className="mr-1">{opt.id}.</strong> {opt.text}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      }

      case 'multiple_select': {
        const msq = q as MultipleSelectQuestion;
        const currentSelected = Array.isArray(rawVal) ? rawVal : [];
        return (
          <fieldset key={q.id} className="border-2 border-black p-4 space-y-3 bg-[#fffdf5]">
            <legend className="font-bold text-sm px-2 border-2 border-black bg-[#f4eed9] text-black">
              Câu hỏi {qNumber} (Chọn nhiều đáp án)
            </legend>
            <p className="font-semibold text-black">{msq.prompt}</p>
            <div className="space-y-2 pt-1">
              {msq.options.map((opt) => {
                const checked = currentSelected.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-2.5 border-2 cursor-pointer transition-colors ${checked
                      ? 'border-black bg-black text-[#fffdf5] font-bold'
                      : 'border-black hover:bg-[#f4eed9] bg-[#fffdf5] text-black'
                      }`}
                  >
                    <input
                      type="checkbox"
                      name={`${section}_${q.id}`}
                      value={opt.id}
                      checked={checked}
                      onChange={() => handleMultipleSelectChange(section, q.id, opt.id)}
                      className="mt-1 accent-black"
                    />
                    <span>
                      <strong className="mr-1">{opt.id}.</strong> {opt.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      }

      case 'fill_blank': {
        const fbq = q as FillBlankQuestion;
        const currentVal = typeof rawVal === 'string' ? rawVal : '';
        return (
          <fieldset key={q.id} className="border-2 border-black p-4 space-y-3 bg-[#fffdf5]">
            <legend className="font-bold text-sm px-2 border-2 border-black bg-[#f4eed9] text-black">
              Câu hỏi {qNumber} (Điền từ vào chỗ trống)
            </legend>
            <label htmlFor={`input_${q.id}`} className="block font-semibold text-black">
              {fbq.prompt}
            </label>
            <div className="pt-1">
              <input
                id={`input_${q.id}`}
                type="text"
                value={currentVal}
                placeholder="Nhập câu trả lời của bạn..."
                onChange={(e) => handleSingleAnswerChange(section, q.id, e.target.value)}
                className="w-full p-2.5 border-2 border-black font-semibold focus-visible:outline-2 bg-[#fcf8ed] text-black placeholder:text-neutral-700"
              />
            </div>
          </fieldset>
        );
      }

      case 'true_false_ng': {
        const tfq = q as TrueFalseNgQuestion;
        const currentSelected = typeof rawVal === 'string' ? rawVal : '';
        const options: Array<'TRUE' | 'FALSE' | 'NOT_GIVEN'> = ['TRUE', 'FALSE', 'NOT_GIVEN'];
        return (
          <fieldset key={q.id} className="border-2 border-black p-4 space-y-3 bg-[#fffdf5]">
            <legend className="font-bold text-sm px-2 border-2 border-black bg-[#f4eed9] text-black">
              Câu hỏi {qNumber} (True / False / Not Given)
            </legend>
            <p className="font-semibold text-black">{tfq.prompt}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {options.map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center justify-center gap-2 p-3 border-2 cursor-pointer text-center font-bold transition-colors ${currentSelected === opt
                    ? 'border-black bg-black text-[#fffdf5]'
                    : 'border-black hover:bg-[#f4eed9] bg-[#fffdf5] text-black'
                    }`}
                >
                  <input
                    type="radio"
                    name={`${section}_${q.id}`}
                    value={opt}
                    checked={currentSelected === opt}
                    onChange={() => handleSingleAnswerChange(section, q.id, opt)}
                    className="accent-black"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      }
    }
  };

  const progressStats = calculateProgressStats(test, answers);
  const progressPercent = Math.round(
    (progressStats.answeredCount / (progressStats.totalCount || 1)) * 100
  );

  return (
    <ListeningAudioProvider
      parts={test.sections.listening?.parts || []}
      isCurrentTab={activeTab === 'listening'}
    >
      <main className="max-w-5xl mx-auto p-3 sm:p-4 md:p-6 space-y-6 w-full min-w-0 overflow-x-hidden">
        {/* Test Title Bar */}
      <div className="border-2 border-black p-4 bg-[#fffdf5] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full min-w-0">
        <div className="space-y-1 min-w-0 max-w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold px-2 py-0.5 border-2 border-black bg-[#f4eed9] inline-block break-all max-w-full">
              {test.id}
            </span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 border-2 border-black bg-black text-[#fffdf5] shrink-0">
              Tiến độ: {progressStats.answeredCount}/{progressStats.totalCount} ({progressPercent}%)
            </span>
            {lastSavedNotice && (
              <span className="text-xs font-mono text-neutral-800 font-semibold">
                ✓ {lastSavedNotice}
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-black mt-1 text-black wrap-break-word">{test.title}</h2>
          <p className="text-xs font-medium text-neutral-800 wrap-break-word">{test.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handlePauseAndExit}
            disabled={isSubmitting}
            className="px-3 py-1.5 border-2 border-black text-xs font-bold bg-[#fcf8ed] text-black hover:bg-[#f4eed9] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            title="Lưu tiến độ và về trang chủ"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Tạm dừng</span>
          </button>
          <button
            type="button"
            onClick={handleDiscardAndExit}
            disabled={isSubmitting}
            className="px-3 py-1.5 border-2 border-black text-xs font-bold bg-[#fffdf5] text-neutral-800 hover:bg-black hover:text-[#fffdf5] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            title="Xóa toàn bộ câu trả lời nháp của bài thi này"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hủy</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 bg-black text-[#fffdf5] text-xs font-black border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Đang chấm...' : 'Nộp bài'}</span>
          </button>
        </div>
      </div>

      {/* Active Skill Tabs (Reading & Listening) */}
      <div
        role="tablist"
        aria-label="Các kỹ năng bài thi"
        className="grid grid-cols-2 gap-2 border-b-2 border-black pb-2"
      >
        {ACTIVE_SKILL_TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab}`}
              id={`tab-${tab}`}
              type="button"
              onClick={() => handleGoToTab(tab)}
              className={`py-2 px-2 sm:px-3 text-center font-bold border-2 border-black transition-colors cursor-pointer relative ${
                isActive
                  ? 'bg-black text-[#fffdf5]'
                  : 'bg-[#fffdf5] text-black hover:bg-[#f4eed9]'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5 text-xs sm:text-sm">
                {TAB_ICONS[tab]}
                <span>{TAB_LABELS[tab]}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {/* READING PANEL */}
        {activeTab === 'reading' && (
          <div
            id="panel-reading"
            role="tabpanel"
            aria-labelledby="tab-reading"
            className="space-y-6"
          >
            <div className="p-3 border-2 border-black bg-[#f4eed9] text-xs sm:text-sm font-semibold text-black flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 text-black mt-0.5" />
              <div>{test.sections.reading.instructions}</div>
            </div>

            {test.sections.reading.passages.map((passage, pIndex) => (
              <div key={passage.id} className="space-y-6">
                <article className="border-2 border-black p-5 bg-[#fffdf5] space-y-3">
                  <h3 className="text-lg font-black border-b-2 border-black pb-2 text-black">
                    {formatSectionTitle('Passage', pIndex + 1, passage.title)}
                  </h3>
                  <div className="text-black leading-relaxed whitespace-pre-line text-sm md:text-base font-serif">
                    {passage.content}
                  </div>
                </article>

                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-black uppercase tracking-wide">
                    Câu hỏi cho đoạn {pIndex + 1}:
                  </h4>
                  {passage.questions.map((q) => renderQuestion(q, 'reading'))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LISTENING PANEL */}
        {activeTab === 'listening' && (
          <div
            id="panel-listening"
            role="tabpanel"
            aria-labelledby="tab-listening"
            className="space-y-6"
          >
            <div className="p-3 border-2 border-black bg-[#f4eed9] text-xs sm:text-sm font-semibold text-black flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 text-black mt-0.5" />
              <div>{test.sections.listening.instructions}</div>
            </div>

            {/* Sticky Mini-Player xuất hiện khi cuộn xuống làm câu hỏi */}
            <StickyListeningMiniPlayer />

            {test.sections.listening.parts.map((part, pIndex) => (
              <div key={part.id} className="space-y-6">
                <article className="border-2 border-black p-5 bg-[#fffdf5] space-y-4">
                  <h3 className="text-lg font-black border-b-2 border-black pb-2 text-black">
                    {formatSectionTitle('Part', pIndex + 1, part.title)}
                  </h3>

                  {/* Trình phát âm thanh Neo-brutalism có sóng âm và scrubber mượt */}
                  <ListeningAudioPlayer part={part} partIndex={pIndex} />

                  {/* Xem transcript tĩnh (mặc định ẩn) */}
                  {part.transcript && (
                    <div className="pt-2 border-t border-neutral-300">
                      <button
                        type="button"
                        onClick={() => toggleTranscript(part.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-black bg-[#f4eed9] hover:bg-black hover:text-[#fffdf5] text-black font-semibold text-xs transition-colors cursor-pointer"
                        aria-expanded={Boolean(expandedTranscripts[part.id])}
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>{expandedTranscripts[part.id] ? 'Ẩn transcript' : 'Xem transcript'}</span>
                      </button>

                      {expandedTranscripts[part.id] && (
                        <div className="mt-2.5 p-3.5 border border-neutral-300 bg-[#fbf9f0] text-xs sm:text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                          {part.transcript}
                        </div>
                      )}
                    </div>
                  )}
                </article>

                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-black uppercase tracking-wide">
                    Câu hỏi cho phần nghe {pIndex + 1}:
                  </h4>
                  {part.questions.map((q) => renderQuestion(q, 'listening'))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Bottom Action Footer */}
      <footer className="border-2 border-black p-4 bg-[#fffdf5] flex flex-col md:flex-row items-center justify-between gap-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full min-w-0">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {hasPrevTab && prevTab && (
            <button
              type="button"
              onClick={() => handleGoToTab(prevTab)}
              disabled={isSubmitting}
              className="px-4 py-2 border-2 border-black text-black bg-[#fffdf5] text-sm font-bold hover:bg-[#f4eed9] transition-colors cursor-pointer"
            >
              ← Quay lại {TAB_LABELS[prevTab]}
            </button>
          )}
          <span className="text-xs text-black font-mono font-bold">
            Phần {currentFlowIndex >= 0 ? currentFlowIndex + 1 : 1}/2: {TAB_LABELS[activeTab]}
          </span>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto justify-end">
          {hasNextTab && nextTab ? (
            <>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2.5 border-2 border-black text-black bg-[#f4eed9] text-sm font-bold hover:bg-black hover:text-[#fffdf5] transition-colors disabled:opacity-50 cursor-pointer"
                title="Nộp toàn bộ bài thi ngay lập tức"
              >
                {isSubmitting ? 'Đang nộp bài...' : 'Nộp bài thi'}
              </button>

              <button
                type="button"
                onClick={() => handleGoToTab(nextTab)}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-black text-[#fffdf5] text-sm font-black border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer"
              >
                Qua phần tiếp theo: {TAB_LABELS[nextTab]} →
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-black text-[#fffdf5] text-sm font-black border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Đang nộp bài...' : 'Hoàn thành bài thi & Nộp điểm →'}
            </button>
          )}
        </div>
      </footer>

      {/* Floating Quick Action Button on Mobile */}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
        className="fixed bottom-6 right-4 z-40 md:hidden px-2.5 py-2 bg-[#f4eed9] text-black font-black text-xs border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer flex items-center gap-1"
        title="Cuộn xuống cuối bài thi"
      >
        <ArrowDown className="w-3.5 h-3.5" />
        <span>Cuối bài</span>
      </button>
    </main>
  </ListeningAudioProvider>
  );
};
