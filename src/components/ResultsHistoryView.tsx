'use client';
import React from 'react';
import { Trash2, FileQuestion } from 'lucide-react';
import type { TestAttempt } from '@/types/test';
import { deleteAttempt } from '@/services/attemptStorage';

interface ResultsHistoryViewProps {
  attempts: TestAttempt[];
  selectedAttemptId?: string | null;
  onSelectAttempt: (id: string) => void;
  onRefreshAttempts: () => void;
}

export const ResultsHistoryView: React.FC<ResultsHistoryViewProps> = ({
  attempts,
  selectedAttemptId,
  onSelectAttempt,
  onRefreshAttempts,
}) => {
  const currentAttempt =
    attempts.find((a) => a.id === selectedAttemptId) || (attempts.length > 0 ? attempts[0] : null);

  const handleDelete = (attemptId: string) => {
    if (window.confirm('Bạn có chắc muốn xóa vĩnh viễn bài làm này khỏi LocalStorage?')) {
      deleteAttempt(attemptId);
      onRefreshAttempts();
    }
  };

  const scrollToQuestion = (questionId: string) => {
    const el = document.getElementById(`q-res-${questionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-4', 'ring-black');
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-black');
      }, 1500);
    }
  };

  if (attempts.length === 0) {
    return (
      <main className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="border-2 border-black p-8 text-center bg-[#fffdf5] space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <FileQuestion className="w-8 h-8 mx-auto text-neutral-600" />
          <h2 className="text-xl font-black text-black">Chưa có kết quả bài thi</h2>
          <p className="text-xs sm:text-sm font-semibold text-neutral-700">
            Hãy vào mục &ldquo;Đề thi&rdquo; để chọn đề và bắt đầu làm bài.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-4 md:p-6 space-y-6 w-full min-w-0 overflow-x-hidden">
      {/* Top Header & Selector */}
      <div className="border-2 border-black p-4 bg-[#fffdf5] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full min-w-0">
        <div className="min-w-0 max-w-full">
          <h2 className="text-lg sm:text-xl font-black text-black">Hồ sơ kết quả thi</h2>
          <p className="text-xs font-semibold text-neutral-700">
            Chi tiết câu trả lời và bảng điểm kỹ năng.
          </p>
        </div>

        {/* Attempt Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full md:w-auto min-w-0">
          <label htmlFor="attempt-select" className="text-xs font-black uppercase shrink-0 text-black">
            Chọn lần thi:
          </label>
          <div className="relative min-w-0 w-full md:w-80">
            <select
              id="attempt-select"
              value={currentAttempt?.id || ''}
              onChange={(e) => onSelectAttempt(e.target.value)}
              className="w-full border-2 border-black p-2 text-xs sm:text-sm font-mono font-bold bg-[#fcf8ed] text-black focus-visible:outline-2 cursor-pointer truncate"
            >
              {attempts.map((att, idx) => {
                const dateStr = new Date(att.submittedAt).toLocaleDateString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                });
                const timeStr = new Date(att.submittedAt).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const title = att.testTitle || att.testId;
                const shortTitle = title.length > 28 ? title.slice(0, 26) + '...' : title;
                return (
                  <option key={att.id} value={att.id} title={`${title} (${att.testId})`}>
                    #{attempts.length - idx} • {shortTitle} ({timeStr} {dateStr})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {currentAttempt && (() => {
        // 10-point Scale Calculations
        const readingCorrect = currentAttempt.scores.reading.correctCount;
        const readingTotal = currentAttempt.scores.reading.totalCount;
        const readingScore10 =
          readingTotal > 0 ? ((readingCorrect / readingTotal) * 10).toFixed(1) : '0.0';

        const listeningCorrect = currentAttempt.scores.listening.correctCount;
        const listeningTotal = currentAttempt.scores.listening.totalCount;
        const listeningScore10 =
          listeningTotal > 0 ? ((listeningCorrect / listeningTotal) * 10).toFixed(1) : '0.0';

        const overallScore10 = ((parseFloat(readingScore10) + parseFloat(listeningScore10)) / 2).toFixed(1);

        return (
          <div className="space-y-6 min-w-0 w-full">
            {/* Top Scoreboard Banner (10-Point Scale) */}
            <section
              aria-labelledby="summary-heading"
              className="border-2 border-black p-5 bg-[#fffdf5] space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full min-w-0"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black pb-3">
                <div className="min-w-0 max-w-full">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 border-2 border-black bg-[#f4eed9] inline-block break-all max-w-full">
                    {currentAttempt.testId}
                  </span>
                  <h3 id="summary-heading" className="text-lg sm:text-xl font-black mt-1 text-black wrap-break-word">
                    {currentAttempt.testTitle}
                  </h3>
                  <p className="text-xs font-semibold text-neutral-800">
                    Thời gian nộp: {new Date(currentAttempt.submittedAt).toLocaleString('vi-VN')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(currentAttempt.id)}
                  className="self-start sm:self-center px-2.5 py-1.5 border-2 border-black text-xs font-bold bg-[#f4eed9] text-black hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa kết quả</span>
                </button>
              </div>

              {/* Overall Score Highlight Banner */}
              <div className="border-2 border-black p-4 bg-[#f4eed9] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border-2 border-black bg-black text-[#fffdf5] font-black flex items-center justify-center font-mono text-lg shrink-0">
                    ★
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase text-neutral-800 tracking-wider block">
                      Điểm Trung Bình Bài Thi (Thang Điểm 10)
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-black font-mono text-black">
                        {overallScore10}
                      </span>
                      <span className="text-sm font-bold text-neutral-700 font-mono">/ 10</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono font-bold text-neutral-800 sm:text-right">
                  <p>Reading: {readingScore10}/10 • Listening: {listeningScore10}/10</p>
                </div>
              </div>

              {/* 2 Skill Cards on Scale 10 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
                {/* Reading */}
                <div className="border-2 border-black p-3 bg-[#fcf8ed] flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-black block uppercase text-neutral-800">Reading</span>
                    <div className="my-1">
                      <span className="text-2xl sm:text-3xl font-black font-mono text-black">
                        {readingScore10}
                      </span>
                      <span className="text-xs font-bold font-mono text-neutral-700"> / 10</span>
                    </div>
                  </div>
                  <span className="text-[11px] block text-neutral-800 font-mono font-bold border-t border-black/20 pt-1">
                    {readingCorrect}/{readingTotal} câu ({Math.round((readingCorrect / (readingTotal || 1)) * 100)}%)
                  </span>
                </div>

                {/* Listening */}
                <div className="border-2 border-black p-3 bg-[#fcf8ed] flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-black block uppercase text-neutral-800">Listening</span>
                    <div className="my-1">
                      <span className="text-2xl sm:text-3xl font-black font-mono text-black">
                        {listeningScore10}
                      </span>
                      <span className="text-xs font-bold font-mono text-neutral-700"> / 10</span>
                    </div>
                  </div>
                  <span className="text-[11px] block text-neutral-800 font-mono font-bold border-t border-black/20 pt-1">
                    {listeningCorrect}/{listeningTotal} câu ({Math.round((listeningCorrect / (listeningTotal || 1)) * 100)}%)
                  </span>
                </div>
              </div>
            </section>

            {/* BẢN ĐỒ CÂU HỎI (QUESTION MAP) */}
            <section
              aria-labelledby="question-map-heading"
              className="border-2 border-black p-4 sm:p-5 bg-[#fffdf5] space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full min-w-0"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black pb-3">
                <div>
                  <h3 id="question-map-heading" className="text-base sm:text-lg font-black text-black flex items-center gap-2">
                    <span>🗺️ Bản đồ câu hỏi (Question Map)</span>
                  </h3>
                  <p className="text-xs font-semibold text-neutral-700">
                    Bấm vào số câu để cuộn nhanh đến câu hỏi tương ứng và xem chi tiết.
                  </p>
                </div>

                {/* Legend & Stats */}
                <div className="flex items-center gap-2 text-xs font-mono font-bold flex-wrap">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 border-2 border-black bg-emerald-100 text-emerald-950">
                    <span className="w-2.5 h-2.5 bg-emerald-600 border border-black inline-block"></span>
                    <span>Đúng: {readingCorrect + listeningCorrect}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 border-2 border-black bg-red-100 text-red-950">
                    <span className="w-2.5 h-2.5 bg-red-600 border border-black inline-block"></span>
                    <span>Chưa đúng: {(readingTotal - readingCorrect) + (listeningTotal - listeningCorrect)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 border-2 border-black bg-[#f4eed9] text-black">
                    <span>Tổng: {readingTotal + listeningTotal} câu</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Reading Map */}
                {currentAttempt.scores.reading.results.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-black uppercase text-black">
                      <span className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 border border-black bg-black text-white font-mono text-[10px]">READING</span>
                        Phần đọc hiểu ({readingCorrect}/{readingTotal} câu đúng)
                      </span>
                      <span className="text-[11px] font-mono text-neutral-600 font-semibold">
                        R1 - R{currentAttempt.scores.reading.results.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {currentAttempt.scores.reading.results.map((res, idx) => (
                        <button
                          key={res.questionId}
                          type="button"
                          onClick={() => scrollToQuestion(res.questionId)}
                          title={`Câu R${idx + 1}: ${res.isCorrect ? 'ĐÚNG' : 'CHƯA ĐÚNG'}`}
                          className={`min-w-9 h-9 px-2 border-2 border-black text-xs font-black font-mono cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-0.5 ${res.isCorrect
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-red-600 text-white hover:bg-red-700'
                            }`}
                        >
                          <span>R{idx + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Listening Map */}
                {currentAttempt.scores.listening.results.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-black/20">
                    <div className="flex items-center justify-between text-xs font-black uppercase text-black">
                      <span className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 border border-black bg-black text-white font-mono text-[10px]">LISTENING</span>
                        Phần nghe hiểu ({listeningCorrect}/{listeningTotal} câu đúng)
                      </span>
                      <span className="text-[11px] font-mono text-neutral-600 font-semibold">
                        L1 - L{currentAttempt.scores.listening.results.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {currentAttempt.scores.listening.results.map((res, idx) => (
                        <button
                          key={res.questionId}
                          type="button"
                          onClick={() => scrollToQuestion(res.questionId)}
                          title={`Câu L${idx + 1}: ${res.isCorrect ? 'ĐÚNG' : 'CHƯA ĐÚNG'}`}
                          className={`min-w-9 h-9 px-2 border-2 border-black text-xs font-black font-mono cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-0.5 ${res.isCorrect
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-red-600 text-white hover:bg-red-700'
                            }`}
                        >
                          <span>L{idx + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 1: READING IMMEDIATE RESULTS */}
            <section aria-labelledby="reading-results-heading" className="space-y-4">
              <h3
                id="reading-results-heading"
                className="text-lg font-black border-b-2 border-black pb-1 flex items-center justify-between text-black"
              >
                <span>1. Chi tiết bài thi Reading</span>
                <span className="text-sm font-mono font-bold">
                  Điểm: {currentAttempt.scores.reading.correctCount}/{currentAttempt.scores.reading.totalCount} câu đúng
                </span>
              </h3>

              <div className="space-y-3">
                {currentAttempt.scores.reading.results.map((res, idx) => {
                  const isCorrect = res.isCorrect;
                  return (
                    <div
                      key={res.questionId}
                      id={`q-res-${res.questionId}`}
                      className={`border-2 border-black p-4 space-y-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all scroll-mt-20 sm:scroll-mt-24 ${isCorrect
                          ? 'bg-[#f6fbf7] border-l-8 border-l-emerald-600'
                          : 'bg-[#fff8f8] border-l-8 border-l-red-600'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-black text-black">
                          Câu #{idx + 1} ({res.questionId} • {res.type})
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 border-2 border-black font-black font-mono flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${isCorrect
                              ? 'bg-emerald-600 text-white'
                              : 'bg-red-600 text-white'
                            }`}
                        >
                          {isCorrect ? '✓ ĐÚNG' : '✕ CHƯA ĐÚNG'}
                        </span>
                      </div>

                      <p className="font-bold text-sm text-black leading-snug">{res.prompt}</p>

                      {/* Hiển thị đáp án: nếu đúng chỉ hiển thị câu trả lời đã chọn, nếu sai hiển thị cả câu trả lời và đáp án đúng */}
                      {isCorrect ? (
                        <div className="p-3 border-2 border-emerald-600 bg-emerald-50 text-xs font-mono flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <span className="font-bold text-emerald-900 block mb-0.5">Đáp án bạn đã chọn:</span>
                            <span className="text-emerald-950 font-black text-sm">{res.userAnswer}</span>
                          </div>
                          <span className="text-emerald-800 font-black text-xs px-2 py-0.5 bg-emerald-100 border border-emerald-600">
                            ✓ Chính xác
                          </span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
                          <div className="p-2.5 border-2 border-red-500 bg-red-50">
                            <span className="font-bold block text-red-900 mb-0.5">Bạn đã trả lời:</span>
                            <span className="text-red-950 font-black text-sm">{res.userAnswer || '(Bỏ trống)'}</span>
                          </div>
                          <div className="p-2.5 border-2 border-emerald-600 bg-emerald-50">
                            <span className="font-bold block text-emerald-900 mb-0.5">Đáp án đúng quy chuẩn:</span>
                            <span className="text-emerald-950 font-black text-sm">{res.correctAnswerSummary}</span>
                          </div>
                        </div>
                      )}

                      {res.explanation && (
                        <div className="text-xs text-neutral-900 bg-[#fffbe6] p-3 border-2 border-amber-400 font-medium space-y-1">
                          <strong className="font-black text-amber-950 flex items-center gap-1">
                            💡 Giải thích chi tiết:
                          </strong>
                          <p className="leading-relaxed">{res.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* SECTION 2: LISTENING IMMEDIATE RESULTS */}
            <section aria-labelledby="listening-results-heading" className="space-y-4">
              <h3
                id="listening-results-heading"
                className="text-lg font-black border-b-2 border-black pb-1 flex items-center justify-between text-black"
              >
                <span>2. Chi tiết bài thi Listening</span>
                <span className="text-sm font-mono font-bold">
                  Điểm: {currentAttempt.scores.listening.correctCount}/{currentAttempt.scores.listening.totalCount} câu đúng
                </span>
              </h3>

              <div className="space-y-3">
                {currentAttempt.scores.listening.results.map((res, idx) => {
                  const isCorrect = res.isCorrect;
                  return (
                    <div
                      key={res.questionId}
                      id={`q-res-${res.questionId}`}
                      className={`border-2 border-black p-4 space-y-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all scroll-mt-20 sm:scroll-mt-24 ${isCorrect
                          ? 'bg-[#f6fbf7] border-l-8 border-l-emerald-600'
                          : 'bg-[#fff8f8] border-l-8 border-l-red-600'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-black text-black">
                          Câu #{idx + 1} ({res.questionId} • {res.type})
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 border-2 border-black font-black font-mono flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${isCorrect
                              ? 'bg-emerald-600 text-white'
                              : 'bg-red-600 text-white'
                            }`}
                        >
                          {isCorrect ? '✓ ĐÚNG' : '✕ CHƯA ĐÚNG'}
                        </span>
                      </div>

                      <p className="font-bold text-sm text-black leading-snug">{res.prompt}</p>

                      {/* Hiển thị đáp án: nếu đúng chỉ hiển thị câu trả lời đã chọn, nếu sai hiển thị cả câu trả lời và đáp án đúng */}
                      {isCorrect ? (
                        <div className="p-3 border-2 border-emerald-600 bg-emerald-50 text-xs font-mono flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <span className="font-bold text-emerald-900 block mb-0.5">Đáp án bạn đã chọn:</span>
                            <span className="text-emerald-950 font-black text-sm">{res.userAnswer}</span>
                          </div>
                          <span className="text-emerald-800 font-black text-xs px-2 py-0.5 bg-emerald-100 border border-emerald-600">
                            ✓ Chính xác
                          </span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
                          <div className="p-2.5 border-2 border-red-500 bg-red-50">
                            <span className="font-bold block text-red-900 mb-0.5">Bạn đã trả lời:</span>
                            <span className="text-red-950 font-black text-sm">{res.userAnswer || '(Bỏ trống)'}</span>
                          </div>
                          <div className="p-2.5 border-2 border-emerald-600 bg-emerald-50">
                            <span className="font-bold block text-emerald-900 mb-0.5">Đáp án đúng quy chuẩn:</span>
                            <span className="text-emerald-950 font-black text-sm">{res.correctAnswerSummary}</span>
                          </div>
                        </div>
                      )}

                      {res.explanation && (
                        <div className="text-xs text-neutral-900 bg-[#fffbe6] p-3 border-2 border-amber-400 font-medium space-y-1">
                          <strong className="font-black text-amber-950 flex items-center gap-1">
                            💡 Giải thích chi tiết:
                          </strong>
                          <p className="leading-relaxed">{res.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        );
      })()}
    </main>
  );
};
