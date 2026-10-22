'use client';
import React, { useState } from 'react';
import type { TestAttempt } from '@/types/test';
import { updateDeferredReview, deleteAttempt } from '@/services/attemptStorage';

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

  const [scoringFormState, setScoringFormState] = useState<
    Record<string, { score: string; notes: string }>
  >({});

  const handleScoreChange = (taskId: string, field: 'score' | 'notes', val: string) => {
    setScoringFormState((prev) => ({
      ...prev,
      [taskId]: {
        score: field === 'score' ? val : prev[taskId]?.score || '',
        notes: field === 'notes' ? val : prev[taskId]?.notes || '',
      },
    }));
  };

  const handleSaveReview = (
    attemptId: string,
    sectionType: 'speaking' | 'writing',
    taskId: string
  ) => {
    const data = scoringFormState[taskId] || { score: '', notes: '' };
    updateDeferredReview(attemptId, sectionType, taskId, {
      score: data.score.trim() || undefined,
      notes: data.notes.trim() || undefined,
      status: 'reviewed',
    });
    onRefreshAttempts();
    alert('Đã lưu kết quả chấm bài và nhận xét vào LocalStorage!');
  };

  const handleDelete = (attemptId: string) => {
    if (window.confirm('Bạn có chắc muốn xóa vĩnh viễn bài làm này khỏi LocalStorage?')) {
      deleteAttempt(attemptId);
      onRefreshAttempts();
    }
  };

  if (attempts.length === 0) {
    return (
      <main className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="border-2 border-black p-8 text-center bg-[#fffdf5] space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-xl font-black text-black">Chưa có kết quả bài thi nào</h2>
          <p className="text-sm font-semibold text-neutral-800">
            Hãy vào mục &ldquo;Danh mục bài thi&rdquo; để chọn đề và hoàn thành bài kiểm tra.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top Header & Selector */}
      <div className="border-2 border-black p-4 bg-[#fffdf5] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div>
          <h2 className="text-xl font-black text-black">Hồ sơ kết quả bài thi (Local History)</h2>
          <p className="text-xs font-semibold text-neutral-800">
            Xem lại chi tiết câu trả lời, đối chiếu đáp án Reading / Listening và chấm điểm Speaking / Writing.
          </p>
        </div>

        {/* Attempt Picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="attempt-select" className="text-xs font-bold uppercase shrink-0 text-black">
            Chọn lần thi:
          </label>
          <select
            id="attempt-select"
            value={currentAttempt?.id || ''}
            onChange={(e) => onSelectAttempt(e.target.value)}
            className="border-2 border-black p-2 text-sm font-mono font-bold bg-[#fcf8ed] text-black focus-visible:outline-2 cursor-pointer"
          >
            {attempts.map((att, idx) => (
              <option key={att.id} value={att.id}>
                #{attempts.length - idx} - {att.testTitle} ({new Date(att.submittedAt).toLocaleTimeString('vi-VN')} {new Date(att.submittedAt).toLocaleDateString('vi-VN')})
              </option>
            ))}
          </select>
        </div>
      </div>

      {currentAttempt && (
        <div className="space-y-6">
          {/* Summary Card */}
          <section
            aria-labelledby="summary-heading"
            className="border-2 border-black p-5 bg-[#fffdf5] space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black pb-3">
              <div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 border-2 border-black bg-[#f4eed9] inline-block">
                  {currentAttempt.testId}
                </span>
                <h3 id="summary-heading" className="text-xl font-black mt-1 text-black">
                  {currentAttempt.testTitle}
                </h3>
                <p className="text-xs font-semibold text-neutral-800">
                  Thời gian nộp: {new Date(currentAttempt.submittedAt).toLocaleString('vi-VN')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(currentAttempt.id)}
                className="self-start sm:self-center px-3 py-1.5 border-2 border-black text-xs font-bold bg-[#f4eed9] text-black hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer"
              >
                Xóa bài thi này
              </button>
            </div>

            {/* Score Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="border-2 border-black p-3 bg-[#fcf8ed]">
                <span className="text-xs font-black block uppercase text-neutral-800">Reading</span>
                <span className="text-2xl font-black font-mono text-black">
                  {currentAttempt.scores.reading.correctCount} / {currentAttempt.scores.reading.totalCount}
                </span>
                <span className="text-xs block text-neutral-800 font-mono font-bold">
                  ({Math.round((currentAttempt.scores.reading.correctCount / (currentAttempt.scores.reading.totalCount || 1)) * 100)}%)
                </span>
              </div>

              <div className="border-2 border-black p-3 bg-[#fcf8ed]">
                <span className="text-xs font-black block uppercase text-neutral-800">Listening</span>
                <span className="text-2xl font-black font-mono text-black">
                  {currentAttempt.scores.listening.correctCount} / {currentAttempt.scores.listening.totalCount}
                </span>
                <span className="text-xs block text-neutral-800 font-mono font-bold">
                  ({Math.round((currentAttempt.scores.listening.correctCount / (currentAttempt.scores.listening.totalCount || 1)) * 100)}%)
                </span>
              </div>

              <div className="border-2 border-black p-3 bg-[#fcf8ed]">
                <span className="text-xs font-black block uppercase text-neutral-800">Speaking</span>
                <span className="text-xs font-black font-mono mt-2 inline-block px-2 py-1 border-2 border-black bg-[#fffdf5]">
                  {currentAttempt.speakingReviews.some((r) => r.status === 'pending_review')
                    ? 'CHỜ CHẤM'
                    : 'ĐÃ CHẤM'}
                </span>
              </div>

              <div className="border-2 border-black p-3 bg-[#fcf8ed]">
                <span className="text-xs font-black block uppercase text-neutral-800">Writing</span>
                <span className="text-xs font-black font-mono mt-2 inline-block px-2 py-1 border-2 border-black bg-[#fffdf5]">
                  {currentAttempt.writingReviews.some((r) => r.status === 'pending_review')
                    ? 'CHỜ CHẤM'
                    : currentAttempt.writingReviews.map((r) => r.score || 'ĐÃ CHẤM').join(' | ')}
                </span>
              </div>
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
              {currentAttempt.scores.reading.results.map((res, idx) => (
                <div
                  key={res.questionId}
                  className="border-2 border-black p-4 bg-[#fffdf5] space-y-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-black">
                      #{idx + 1} ({res.questionId} - {res.type})
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 border-2 font-black font-mono ${
                        res.isCorrect ? 'bg-black text-[#fffdf5] border-black' : 'bg-[#f4eed9] text-black border-black'
                      }`}
                    >
                      {res.isCorrect ? '[ĐÚNG]' : '[CHƯA ĐÚNG]'}
                    </span>
                  </div>

                  <p className="font-bold text-sm text-black">{res.prompt}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div className="p-2 border-2 border-black bg-[#fcf8ed]">
                      <span className="font-bold block text-neutral-800">Bạn đã trả lời:</span>
                      <span className="text-black font-black">{res.userAnswer}</span>
                    </div>
                    <div className="p-2 border-2 border-black bg-[#f4eed9]">
                      <span className="font-bold block text-neutral-800">Đáp án đúng quy chuẩn:</span>
                      <span className="text-black font-black">{res.correctAnswerSummary}</span>
                    </div>
                  </div>

                  {res.explanation && (
                    <p className="text-xs text-black bg-[#f4eed9] p-2.5 border-l-4 border-black font-medium">
                      <strong>Giải thích:</strong> {res.explanation}
                    </p>
                  )}
                </div>
              ))}
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
              {currentAttempt.scores.listening.results.map((res, idx) => (
                <div
                  key={res.questionId}
                  className="border-2 border-black p-4 bg-[#fffdf5] space-y-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-black">
                      #{idx + 1} ({res.questionId} - {res.type})
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 border-2 font-black font-mono ${
                        res.isCorrect ? 'bg-black text-[#fffdf5] border-black' : 'bg-[#f4eed9] text-black border-black'
                      }`}
                    >
                      {res.isCorrect ? '[ĐÚNG]' : '[CHƯA ĐÚNG]'}
                    </span>
                  </div>

                  <p className="font-bold text-sm text-black">{res.prompt}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div className="p-2 border-2 border-black bg-[#fcf8ed]">
                      <span className="font-bold block text-neutral-800">Bạn đã trả lời:</span>
                      <span className="text-black font-black">{res.userAnswer}</span>
                    </div>
                    <div className="p-2 border-2 border-black bg-[#f4eed9]">
                      <span className="font-bold block text-neutral-800">Đáp án đúng quy chuẩn:</span>
                      <span className="text-black font-black">{res.correctAnswerSummary}</span>
                    </div>
                  </div>

                  {res.explanation && (
                    <p className="text-xs text-black bg-[#f4eed9] p-2.5 border-l-4 border-black font-medium">
                      <strong>Giải thích:</strong> {res.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* SECTION 3: SPEAKING DEFERRED REVIEW */}
          <section aria-labelledby="speaking-results-heading" className="space-y-4">
            <h3 id="speaking-results-heading" className="text-lg font-black border-b-2 border-black pb-1 text-black">
              3. Chấm bài Speaking (Tự chấm theo Rubric & Sample)
            </h3>

            <div className="space-y-6">
              {currentAttempt.speakingReviews.map((rev) => {
                const currentScore = scoringFormState[rev.taskId]?.score ?? rev.score ?? '';
                const currentNotes = scoringFormState[rev.taskId]?.notes ?? rev.notes ?? '';

                return (
                  <article key={rev.taskId} className="border-2 border-black p-5 bg-[#fffdf5] space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="flex items-center justify-between">
                      <h4 className="font-black text-base text-black">{rev.title}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 border-2 font-mono font-bold ${
                          rev.status === 'reviewed' ? 'bg-black text-[#fffdf5] border-black' : 'bg-[#f4eed9] text-black border-black'
                        }`}
                      >
                        {rev.status === 'reviewed' ? '[ĐÃ CHẤM]' : '[CHỜ CHẤM]'}
                      </span>
                    </div>

                    <div className="text-xs text-black bg-[#f4eed9] p-3 border-2 border-black whitespace-pre-line font-medium">
                      <strong className="block mb-1 uppercase font-mono font-bold">Đề bài:</strong> {rev.prompt}
                    </div>

                    {/* User response */}
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-black">Dàn ý bài làm của bạn:</p>
                      <div className="p-3 border-2 border-black bg-[#fcf8ed] text-sm whitespace-pre-line font-mono font-medium text-black">
                        {rev.userText || '(Bạn chưa nhập nội dung nào khi làm bài)'}
                      </div>
                    </div>

                    {/* Rubric Table */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-black">
                        Tiêu chí chấm bài (Rubric quy định trong JSON):
                      </p>
                      <div className="border-2 border-black overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#f4eed9] border-b-2 border-black">
                              <th className="p-2.5 border-r-2 border-black font-black text-black">Tiêu chí</th>
                              <th className="p-2.5 font-black text-black">Yêu cầu đạt được</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rev.rubric.map((r, rIdx) => (
                              <tr key={rIdx} className="border-b border-black">
                                <td className="p-2.5 border-r-2 border-black font-bold whitespace-nowrap text-black">
                                  {r.criterion}
                                </td>
                                <td className="p-2.5 text-neutral-900 font-medium">{r.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sample Answer */}
                    {rev.sampleAnswer && (
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-black">Bài mẫu tham khảo:</p>
                        <div className="p-3 border-2 border-black bg-[#f4eed9] text-xs italic leading-relaxed text-black">
                          {rev.sampleAnswer}
                        </div>
                      </div>
                    )}

                    {/* Self-grading form */}
                    <div className="border-t-2 border-black pt-4 space-y-3 bg-[#fcf8ed] p-4 border-2">
                      <h5 className="text-sm font-black text-black">Đánh giá & Ghi chú chấm bài:</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label
                            htmlFor={`speaking_score_${rev.taskId}`}
                            className="block text-xs font-bold mb-1 text-black"
                          >
                            Điểm đánh giá (VD: 7.5 hoặc 8/10):
                          </label>
                          <input
                            id={`speaking_score_${rev.taskId}`}
                            type="text"
                            value={currentScore}
                            placeholder="Nhập điểm..."
                            onChange={(e) => handleScoreChange(rev.taskId, 'score', e.target.value)}
                            className="w-full p-2 border-2 border-black text-sm bg-[#fffdf5] font-semibold text-black focus-visible:outline-2"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label
                            htmlFor={`speaking_notes_${rev.taskId}`}
                            className="block text-xs font-bold mb-1 text-black"
                          >
                            Nhận xét / Rút kinh nghiệm:
                          </label>
                          <input
                            id={`speaking_notes_${rev.taskId}`}
                            type="text"
                            value={currentNotes}
                            placeholder="Ghi chú nhận xét của bạn..."
                            onChange={(e) => handleScoreChange(rev.taskId, 'notes', e.target.value)}
                            className="w-full p-2 border-2 border-black text-sm bg-[#fffdf5] font-semibold text-black focus-visible:outline-2"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveReview(currentAttempt.id, 'speaking', rev.taskId)}
                        className="px-4 py-2 bg-black text-[#fffdf5] font-bold text-xs border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer"
                      >
                        Lưu đánh giá Speaking
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* SECTION 4: WRITING DEFERRED REVIEW */}
          <section aria-labelledby="writing-results-heading" className="space-y-4">
            <h3 id="writing-results-heading" className="text-lg font-black border-b-2 border-black pb-1 text-black">
              4. Kết quả chấm bài Writing (AI Gemini 3.8 Flash theo Rubric)
            </h3>

            <div className="space-y-6">
              {currentAttempt.writingReviews.map((rev) => {
                const currentScore = String(scoringFormState[rev.taskId]?.score ?? rev.score ?? '');
                const currentNotes = scoringFormState[rev.taskId]?.notes ?? rev.notes ?? '';
                const wordCount = rev.userText.trim() ? rev.userText.trim().split(/\s+/).length : 0;

                return (
                  <article key={rev.taskId} className="border-2 border-black p-5 bg-[#fffdf5] space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="flex items-center justify-between">
                      <h4 className="font-black text-base text-black">{rev.title}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 border-2 font-mono font-bold ${
                          rev.status === 'reviewed' ? 'bg-black text-[#fffdf5] border-black' : 'bg-[#f4eed9] text-black border-black'
                        }`}
                      >
                        {rev.status === 'reviewed'
                          ? `[ĐÃ CHẤM${rev.score ? `: ${rev.score}` : ''}]`
                          : '[CHỜ CHẤM]'}
                      </span>
                    </div>

                    <div className="text-xs text-black bg-[#f4eed9] p-3 border-2 border-black whitespace-pre-line font-medium">
                      <strong className="block mb-1 uppercase font-mono font-bold">Đề bài:</strong> {rev.prompt}
                    </div>

                    {/* User response */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-black">
                        <span>Bài viết của bạn:</span>
                        <span className="font-mono">Số từ: {wordCount}</span>
                      </div>
                      <div className="p-4 border-2 border-black bg-[#fcf8ed] text-sm whitespace-pre-line leading-relaxed font-serif text-black">
                        {rev.userText || '(Bạn chưa viết bài luận nào khi làm bài)'}
                      </div>
                    </div>

                    {/* Rubric Table */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-black">
                        Tiêu chí chấm bài (Rubric quy định trong JSON):
                      </p>
                      <div className="border-2 border-black overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#f4eed9] border-b-2 border-black">
                              <th className="p-2.5 border-r-2 border-black font-black text-black">Tiêu chí</th>
                              <th className="p-2.5 font-black text-black">Yêu cầu đạt được</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rev.rubric.map((r, rIdx) => (
                              <tr key={rIdx} className="border-b border-black">
                                <td className="p-2.5 border-r-2 border-black font-bold whitespace-nowrap text-black">
                                  {r.criterion}
                                </td>
                                <td className="p-2.5 text-neutral-900 font-medium">{r.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sample Answer */}
                    {rev.sampleAnswer && (
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-black">Bài viết mẫu tham khảo:</p>
                        <div className="p-3 border-2 border-black bg-[#f4eed9] text-xs italic leading-relaxed whitespace-pre-line text-black">
                          {rev.sampleAnswer}
                        </div>
                      </div>
                    )}

                    {/* Self-grading form */}
                    <div className="border-t-2 border-black pt-4 space-y-3 bg-[#fcf8ed] p-4 border-2">
                      <h5 className="text-sm font-black text-black">Đánh giá & Ghi chú chấm bài:</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label
                            htmlFor={`writing_score_${rev.taskId}`}
                            className="block text-xs font-bold mb-1 text-black"
                          >
                            Điểm đánh giá (VD: 8.0 hoặc 85/100):
                          </label>
                          <input
                            id={`writing_score_${rev.taskId}`}
                            type="text"
                            value={currentScore}
                            placeholder="Nhập điểm..."
                            onChange={(e) => handleScoreChange(rev.taskId, 'score', e.target.value)}
                            className="w-full p-2 border-2 border-black text-sm bg-[#fffdf5] font-semibold text-black focus-visible:outline-2"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label
                            htmlFor={`writing_notes_${rev.taskId}`}
                            className="block text-xs font-bold mb-1 text-black"
                          >
                            Nhận xét chi tiết (AI / Ghi chú):
                          </label>
                          <textarea
                            id={`writing_notes_${rev.taskId}`}
                            rows={6}
                            value={currentNotes}
                            placeholder="Ghi chú nhận xét của bạn..."
                            onChange={(e) => handleScoreChange(rev.taskId, 'notes', e.target.value)}
                            className="w-full p-2 border-2 border-black text-sm bg-[#fffdf5] font-semibold text-black focus-visible:outline-2 whitespace-pre-line"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveReview(currentAttempt.id, 'writing', rev.taskId)}
                        className="px-4 py-2 bg-black text-[#fffdf5] font-bold text-xs border-2 border-black hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer"
                      >
                        Lưu đánh giá Writing
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
