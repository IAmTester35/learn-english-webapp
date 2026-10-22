'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { gradeWritingTaskWithServer } from '@/services/aiApi';
import { useNavigationGuard } from './NavigationGuard';

interface TestRunnerViewProps {
  test: TestDocument;
  aiEnabled: boolean;
}

type SkillTab = 'reading' | 'listening' | 'speaking' | 'writing';

const SKILL_TABS: SkillTab[] = ['reading', 'listening', 'speaking', 'writing'];
const TAB_LABELS: Record<SkillTab, string> = {
  reading: '1. Reading',
  listening: '2. Listening',
  speaking: '3. Speaking',
  writing: '4. Writing',
};

export const TestRunnerView: React.FC<TestRunnerViewProps> = ({ test, aiEnabled }) => {
  const router = useRouter();
  const { setIsTestInProgress } = useNavigationGuard();

  const [activeTab, setActiveTab] = useState<SkillTab>('reading');
  const [answers, setAnswers] = useState<UserAnswers>({
    reading: {},
    listening: {},
    speaking: {},
    writing: {},
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeSpeechPartId, setActiveSpeechPartId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsTestInProgress(true);
    return () => {
      setIsTestInProgress(false);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [setIsTestInProgress]);

  const currentTabIndex = SKILL_TABS.indexOf(activeTab);
  const hasNextTab = currentTabIndex < SKILL_TABS.length - 1;
  const nextTab = hasNextTab ? SKILL_TABS[currentTabIndex + 1] : null;
  const hasPrevTab = currentTabIndex > 0;
  const prevTab = hasPrevTab ? SKILL_TABS[currentTabIndex - 1] : null;

  const handleGoToTab = (tab: SkillTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSingleAnswerChange = (section: 'reading' | 'listening', qId: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [qId]: value,
      },
    }));
  };

  const handleMultipleSelectChange = (
    section: 'reading' | 'listening',
    qId: string,
    optionId: string
  ) => {
    setAnswers((prev) => {
      const currentList = (prev[section][qId] as string[]) || [];
      const exists = currentList.includes(optionId);
      const updatedList = exists
        ? currentList.filter((item) => item !== optionId)
        : [...currentList, optionId];
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [qId]: updatedList,
        },
      };
    });
  };

  const handleSpeakingChange = (taskId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      speaking: {
        ...prev.speaking,
        [taskId]: text,
      },
    }));
  };

  const handleWritingChange = (taskId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      writing: {
        ...prev.writing,
        [taskId]: text,
      },
    }));
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setActiveSpeechPartId(null);
  };

  const playBrowserSpeech = (partId: string, text: string) => {
    if (!('speechSynthesis' in window)) {
      alert('Trình duyệt không hỗ trợ Web Speech API.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.onstart = () => setActiveSpeechPartId(partId);
    utterance.onend = () => setActiveSpeechPartId(null);
    utterance.onerror = () => setActiveSpeechPartId(null);
    window.speechSynthesis.speak(utterance);
  };

  const handleCancel = () => {
    if (window.confirm('Bạn có chắc muốn thoát bài thi hiện tại và quay về danh mục? Bài làm hiện tại sẽ không được lưu.')) {
      setIsTestInProgress(false);
      stopAudio();
      router.push('/');
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const confirmed = window.confirm(
      'Bạn có chắc chắn muốn nộp bài thi không?\n\n- Reading & Listening sẽ được chấm điểm ngay.\n- Writing sẽ được gửi lên server chấm tự động bằng AI (nếu có cấu hình API Key).\n- Speaking sẽ được lưu để đối chiếu sau.'
    );
    if (!confirmed) return;

    stopAudio();
    setIsSubmitting(true);
    try {
      const attempt = gradeTestAttempt(test, answers);

      if (aiEnabled) {
        attempt.writingReviews = await Promise.all(
          attempt.writingReviews.map(async (review) => {
            try {
              const res = await gradeWritingTaskWithServer({
                testId: test.id,
                taskId: review.taskId,
                userText: review.userText,
              });
              if (res) {
                return {
                  ...review,
                  score: res.score,
                  notes: res.notes,
                  status: 'reviewed' as const,
                };
              }
            } catch (err) {
              console.error('Lỗi khi chấm AI cho task:', review.taskId, err);
            }
            return review;
          })
        );
      }

      saveNewAttempt(attempt);
      setIsTestInProgress(false);
      router.push(`/results/${attempt.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (q: Question, section: 'reading' | 'listening') => {
    const rawVal = answers[section][q.id];

    switch (q.type) {
      case 'multiple_choice': {
        const mcq = q as MultipleChoiceQuestion;
        const currentSelected = typeof rawVal === 'string' ? rawVal : '';
        return (
          <fieldset key={q.id} className="border-2 border-black p-4 space-y-3 bg-white">
            <legend className="font-bold text-sm px-2 border-2 border-black bg-white">
              Câu hỏi: {mcq.id}
            </legend>
            <p className="font-semibold text-black">{mcq.prompt}</p>
            <div className="space-y-2 pt-1">
              {mcq.options.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-2.5 border-2 cursor-pointer transition-colors ${
                    currentSelected === opt.id
                      ? 'border-black bg-black text-white font-medium'
                      : 'border-neutral-300 hover:border-black bg-white text-black'
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
          <fieldset key={q.id} className="border-2 border-black p-4 space-y-3 bg-white">
            <legend className="font-bold text-sm px-2 border-2 border-black bg-white">
              Câu hỏi: {msq.id} (Chọn nhiều đáp án)
            </legend>
            <p className="font-semibold text-black">{msq.prompt}</p>
            <div className="space-y-2 pt-1">
              {msq.options.map((opt) => {
                const checked = currentSelected.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-2.5 border-2 cursor-pointer transition-colors ${
                      checked
                        ? 'border-black bg-black text-white font-medium'
                        : 'border-neutral-300 hover:border-black bg-white text-black'
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
          <fieldset key={q.id} className="border-2 border-black p-4 space-y-3 bg-white">
            <legend className="font-bold text-sm px-2 border-2 border-black bg-white">
              Câu hỏi: {fbq.id} (Điền từ vào chỗ trống)
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
                className="w-full p-2.5 border-2 border-black font-medium focus-visible:outline-2 bg-white text-black"
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
          <fieldset key={q.id} className="border-2 border-black p-4 space-y-3 bg-white">
            <legend className="font-bold text-sm px-2 border-2 border-black bg-white">
              Câu hỏi: {tfq.id} (True / False / Not Given)
            </legend>
            <p className="font-semibold text-black">{tfq.prompt}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {options.map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center justify-center gap-2 p-3 border-2 cursor-pointer text-center font-bold transition-colors ${
                    currentSelected === opt
                      ? 'border-black bg-black text-white'
                      : 'border-neutral-300 hover:border-black bg-white text-black'
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

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Test Title Bar */}
      <div className="border-2 border-black p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 border border-black inline-block">
            {test.id}
          </span>
          <h2 className="text-xl font-bold mt-1">{test.title}</h2>
          <p className="text-xs text-neutral-600">{test.description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="px-4 py-2 border-2 border-black text-sm font-semibold hover:bg-neutral-100 disabled:opacity-50 cursor-pointer"
          >
            Hủy bài thi
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 bg-black text-white text-sm font-bold border-2 border-black hover:bg-white hover:text-black transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Đang chấm điểm & nộp bài...' : 'Nộp bài & Chấm điểm →'}
          </button>
        </div>
      </div>

      {/* 4 Skill Tabs */}
      <div
        role="tablist"
        aria-label="Các kỹ năng bài thi"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b-2 border-black pb-2"
      >
        {SKILL_TABS.map((tab) => {
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
              className={`py-3 px-4 text-center font-bold border-2 border-black transition-colors cursor-pointer ${
                isActive ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100'
              }`}
            >
              {TAB_LABELS[tab]}
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
            <div className="p-3 border-2 border-black bg-neutral-50 text-sm">
              <strong>Hướng dẫn:</strong> {test.sections.reading.instructions}
            </div>

            {test.sections.reading.passages.map((passage, pIndex) => (
              <div key={passage.id} className="space-y-6">
                <article className="border-2 border-black p-5 bg-white space-y-3">
                  <h3 className="text-lg font-bold border-b border-black pb-2">
                    Passage {pIndex + 1}: {passage.title}
                  </h3>
                  <div className="text-neutral-900 leading-relaxed whitespace-pre-line text-sm md:text-base font-serif">
                    {passage.content}
                  </div>
                </article>

                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-neutral-700 uppercase tracking-wide">
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
            <div className="p-3 border-2 border-black bg-neutral-50 text-sm">
              <strong>Hướng dẫn:</strong> {test.sections.listening.instructions}
            </div>

            {test.sections.listening.parts.map((part, pIndex) => (
              <div key={part.id} className="space-y-6">
                <article className="border-2 border-black p-5 bg-white space-y-4">
                  <h3 className="text-lg font-bold border-b border-black pb-2">
                    Part {pIndex + 1}: {part.title}
                  </h3>

                  <div className="p-4 border-2 border-black bg-white space-y-3">
                    <p className="text-sm font-semibold">Trình phát Audio:</p>
                    {part.audioUrl && (
                      <audio
                        controls
                        className="w-full"
                        aria-label={`Âm thanh cho ${part.title}`}
                        src={part.audioUrl}
                      >
                        Trình duyệt không hỗ trợ thẻ audio.
                      </audio>
                    )}

                    {part.transcript && (
                      <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeSpeechPartId === part.id) {
                              stopAudio();
                            } else {
                              playBrowserSpeech(part.id, part.transcript!);
                            }
                          }}
                          className={`px-3 py-1.5 border-2 border-black text-xs font-bold transition-colors cursor-pointer ${
                            activeSpeechPartId === part.id
                              ? 'bg-black text-white'
                              : 'bg-white text-black hover:bg-neutral-100'
                          }`}
                        >
                          {activeSpeechPartId === part.id
                            ? '■ Dừng đọc Web Speech API'
                            : '▶ Đọc transcript bằng Web Speech API'}
                        </button>
                        <span className="text-xs text-neutral-500">
                          (Dự phòng giọng đọc trình duyệt)
                        </span>
                      </div>
                    )}
                  </div>
                </article>

                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-neutral-700 uppercase tracking-wide">
                    Câu hỏi cho phần nghe {pIndex + 1}:
                  </h4>
                  {part.questions.map((q) => renderQuestion(q, 'listening'))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SPEAKING PANEL */}
        {activeTab === 'speaking' && (
          <div
            id="panel-speaking"
            role="tabpanel"
            aria-labelledby="tab-speaking"
            className="space-y-6"
          >
            <div className="p-3 border-2 border-black bg-neutral-50 text-sm">
              <strong>Hướng dẫn:</strong> {test.sections.speaking.instructions}
            </div>

            {test.sections.speaking.tasks.map((task, tIndex) => {
              const currentNotes = answers.speaking[task.id] || '';
              return (
                <article key={task.id} className="border-2 border-black p-5 bg-white space-y-4">
                  <h3 className="text-lg font-bold border-b border-black pb-2">
                    Task {tIndex + 1}: {task.title}
                  </h3>

                  <div className="p-4 border-2 border-black bg-neutral-50 whitespace-pre-line text-sm md:text-base font-medium">
                    {task.prompt}
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor={`speaking_notes_${task.id}`}
                      className="block font-bold text-sm"
                    >
                      Dàn ý / Ghi chú câu trả lời của bạn:
                    </label>
                    <textarea
                      id={`speaking_notes_${task.id}`}
                      rows={8}
                      value={currentNotes}
                      placeholder="Ghi chú các luận điểm chính, từ vựng và câu trả lời của bạn tại đây..."
                      onChange={(e) => handleSpeakingChange(task.id, e.target.value)}
                      className="w-full p-3 border-2 border-black font-sans text-sm focus-visible:outline-2 bg-white text-black"
                    ></textarea>
                    <div className="flex justify-between text-xs text-neutral-600 font-mono">
                      <span>Độ dài: {currentNotes.length} ký tự</span>
                      <span>(Sẽ lưu để tự đối chiếu rubric sau khi nộp)</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* WRITING PANEL */}
        {activeTab === 'writing' && (
          <div
            id="panel-writing"
            role="tabpanel"
            aria-labelledby="tab-writing"
            className="space-y-6"
          >
            <div className="p-3 border-2 border-black bg-neutral-50 text-sm">
              <strong>Hướng dẫn:</strong> {test.sections.writing.instructions}
            </div>

            {test.sections.writing.tasks.map((task, tIndex) => {
              const currentText = answers.writing[task.id] || '';
              const wordCount = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
              const minWords = task.minWords || 0;

              return (
                <article key={task.id} className="border-2 border-black p-5 bg-white space-y-4">
                  <h3 className="text-lg font-bold border-b border-black pb-2">
                    Task {tIndex + 1}: {task.title}
                  </h3>

                  <div className="p-4 border-2 border-black bg-neutral-50 whitespace-pre-line text-sm md:text-base font-medium">
                    {task.prompt}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`writing_essay_${task.id}`}
                        className="font-bold text-sm"
                      >
                        Bài làm của bạn:
                      </label>
                      <div className="text-xs font-mono font-bold">
                        <span>Số từ: {wordCount}</span>
                        {minWords > 0 && (
                          <span
                            className={`ml-2 px-1.5 py-0.5 border ${
                              wordCount >= minWords
                                ? 'border-black bg-black text-white'
                                : 'border-neutral-400 text-neutral-600'
                            }`}
                          >
                            Tối thiểu: {minWords} từ
                          </span>
                        )}
                      </div>
                    </div>

                    <textarea
                      id={`writing_essay_${task.id}`}
                      rows={12}
                      value={currentText}
                      placeholder="Viết bài luận của bạn tại đây..."
                      onChange={(e) => handleWritingChange(task.id, e.target.value)}
                      className="w-full p-3 border-2 border-black font-sans text-sm focus-visible:outline-2 bg-white text-black"
                    ></textarea>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <footer className="border-2 border-black p-4 bg-white flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {hasPrevTab && prevTab && (
            <button
              type="button"
              onClick={() => handleGoToTab(prevTab)}
              disabled={isSubmitting}
              className="px-4 py-2 border-2 border-neutral-300 text-neutral-700 text-sm font-semibold hover:border-black hover:text-black transition-colors cursor-pointer"
            >
              ← Quay lại {TAB_LABELS[prevTab]}
            </button>
          )}
          <span className="text-xs text-neutral-500 font-mono">
            Phần {currentTabIndex + 1}/4: {TAB_LABELS[activeTab]}
          </span>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto justify-end">
          {hasNextTab && nextTab ? (
            <>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2.5 border border-neutral-300 text-neutral-600 text-sm font-medium hover:border-neutral-500 hover:text-black transition-colors disabled:opacity-50 cursor-pointer"
                title="Nộp toàn bộ bài thi ngay lập tức"
              >
                {isSubmitting ? 'Đang nộp bài...' : 'Nộp bài thi'}
              </button>

              <button
                type="button"
                onClick={() => handleGoToTab(nextTab)}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-black text-white text-sm font-bold border-2 border-black hover:bg-white hover:text-black transition-colors cursor-pointer"
              >
                Qua phần tiếp theo: {TAB_LABELS[nextTab]} →
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-black text-white text-sm font-bold border-2 border-black hover:bg-white hover:text-black transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Đang chấm Writing bằng AI...' : 'Hoàn thành bài thi & Nộp điểm →'}
            </button>
          )}
        </div>
      </footer>
    </main>
  );
};
