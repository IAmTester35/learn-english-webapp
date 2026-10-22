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
        <div className="border-2 border-black p-8 text-center bg-white space-y-3">
          <h2 className="text-xl font-bold">Chưa có kết quả bài thi nào</h2>
          <p className="text-sm text-neutral-600">
            Hãy vào mục &ldquo;Danh mục bài thi&rdquo; để chọn đề và hoàn thành bài kiểm tra.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top Header & Selector */}
      <div className="border-2 border-black p-4 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Hồ sơ kết quả bài thi (Local History)</h2>
          <p className="text-xs text-neutral-600">
            Xem lại chi tiết câu trả lời, đối chiếu đáp án Reading / Listening và chấm điểm Speaking / Writing.
          </p>
        </div>

        {/* Attempt Picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="attempt-select" className="text-xs font-bold uppercase shrink-0">
            Chọn lần thi:
          </label>
          <select
            id="attempt-select"
            value={currentAttempt?.id || ''}
            onChange={(e) => onSelectAttempt(e.target.value)}
            className="border-2 border-black p-2 text-sm font-mono bg-white text-black focus-visible:outline-2"
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
            className="border-2 border-black p-5 bg-white space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black pb-3">
              <div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 border border-black inline-block">
                  {currentAttempt.testId}
                </span>
                <h3 id="summary-heading" className="text-xl font-bold mt-1">
                  {currentAttempt.testTitle}
                </h3>
                <p className="text-xs text-neutral-600">
                  Thời gian nộp: {new Date(currentAttempt.submittedAt).toLocaleString('vi-VN')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(currentAttempt.id)}
                className="self-start sm:self-center px-3 py-1.5 border border-black text-xs font-bold hover:bg-neutral-100"
              >
                Xóa bài thi này
              </button>
            </div>

            {/* Score Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="border-2 border-black p-3 bg-white">
                <span className="text-xs font-bold block uppercase text-neutral-600">Reading</span>
                <span className="text-2xl font-bold font-mono">
                  {currentAttempt.scores.reading.correctCount} / {currentAttempt.scores.reading.totalCount}
                </span>
                <span className="text-xs block text-neutral-500 font-mono">
                  ({Math.round((currentAttempt.scores.reading.correctCount / (currentAttempt.scores.reading.totalCount || 1)) * 100)}%)
                </span>
              </div>

              <div className="border-2 border-black p-3 bg-white">
                <span className="text-xs font-bold block uppercase text-neutral-600">Listening</span>
                <span className="text-2xl font-bold font-mono">
                  {currentAttempt.scores.listening.correctCount} / {currentAttempt.scores.listening.totalCount}
                </span>
                <span className="text-xs block text-neutral-500 font-mono">
                  ({Math.round((currentAttempt.scores.listening.correctCount / (currentAttempt.scores.listening.totalCount || 1)) * 100)}%)
                </span>
              </div>

              <div className="border-2 border-black p-3 bg-white">
                <span className="text-xs font-bold block uppercase text-neutral-600">Speaking</span>
                <span className="text-xs font-bold font-mono mt-2 inline-block px-2 py-1 border border-black">
                  {currentAttempt.speakingReviews.some((r) => r.status === 'pending_review')
                    ? 'CHỜ CHẤM'
                    : 'ĐÃ CHẤM'}
                </span>
              </div>

              <div className="border-2 border-black p-3 bg-white">
                <span className="text-xs font-bold block uppercase text-neutral-600">Writing</span>
                <span className="text-xs font-bold font-mono mt-2 inline-block px-2 py-1 border border-black">
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
              className="text-lg font-bold border-b-2 border-black pb-1 flex items-center justify-between"
            >
              <span>1. Chi tiết bài thi Reading</span>
              <span className="text-sm font-mono font-normal">
                Điểm: {currentAttempt.scores.reading.correctCount}/{currentAttempt.scores.reading.totalCount} câu đúng
              </span>
            </h3>

            <div className="space-y-3">
              {currentAttempt.scores.reading.results.map((res, idx) => (
                <div
                  key={res.questionId}
                  className={`border-2 p-4 bg-white space-y-2 ${
                    res.isCorrect ? 'border-black' : 'border-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold">
                      #{idx + 1} ({res.questionId} - {res.type})
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 border font-bold font-mono ${
                        res.isCorrect ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
                      }`}
                    >
                      {res.isCorrect ? '[ĐÚNG]' : '[CHƯA ĐÚNG]'}
                    </span>
                  </div>

                  <p className="font-semibold text-sm">{res.prompt}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div className="p-2 border border-neutral-300 bg-neutral-50">
                      <span className="font-bold block text-neutral-600">Bạn đã trả lời:</span>
                      <span className="text-black font-medium">{res.userAnswer}</span>
                    </div>
                    <div className="p-2 border border-black bg-white">
                      <span className="font-bold block text-neutral-600">Đáp án đúng quy chuẩn:</span>
                      <span className="text-black font-bold">{res.correctAnswerSummary}</span>
                    </div>
                  </div>

                  {res.explanation && (
                    <p className="text-xs text-neutral-700 bg-neutral-100 p-2 border-l-2 border-black">
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
              className="text-lg font-bold border-b-2 border-black pb-1 flex items-center justify-between"
            >
              <span>2. Chi tiết bài thi Listening</span>
              <span className="text-sm font-mono font-normal">
                Điểm: {currentAttempt.scores.listening.correctCount}/{currentAttempt.scores.listening.totalCount} câu đúng
              </span>
            </h3>

            <div className="space-y-3">
              {currentAttempt.scores.listening.results.map((res, idx) => (
                <div
                  key={res.questionId}
                  className={`border-2 p-4 bg-white space-y-2 ${
                    res.isCorrect ? 'border-black' : 'border-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold">
                      #{idx + 1} ({res.questionId} - {res.type})
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 border font-bold font-mono ${
                        res.isCorrect ? 'bg-black text-white border-black' : 'bg-white text-black border-black'
                      }`}
                    >
                      {res.isCorrect ? '[ĐÚNG]' : '[CHƯA ĐÚNG]'}
                    </span>
                  </div>

                  <p className="font-semibold text-sm">{res.prompt}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div className="p-2 border border-neutral-300 bg-neutral-50">
                      <span className="font-bold block text-neutral-600">Bạn đã trả lời:</span>
                      <span className="text-black font-medium">{res.userAnswer}</span>
                    </div>
                    <div className="p-2 border border-black bg-white">
                      <span className="font-bold block text-neutral-600">Đáp án đúng quy chuẩn:</span>
                      <span className="text-black font-bold">{res.correctAnswerSummary}</span>
                    </div>
                  </div>

                  {res.explanation && (
                    <p className="text-xs text-neutral-700 bg-neutral-100 p-2 border-l-2 border-black">
                      <strong>Giải thích:</strong> {res.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* SECTION 3: SPEAKING DEFERRED REVIEW */}
          <section aria-labelledby="speaking-results-heading" className="space-y-4">
            <h3 id="speaking-results-heading" className="text-lg font-bold border-b-2 border-black pb-1">
              3. Chấm bài Speaking (Tự chấm theo Rubric & Sample)
            </h3>

            <div className="space-y-6">
              {currentAttempt.speakingReviews.map((rev) => {
                const currentScore = scoringFormState[rev.taskId]?.score ?? rev.score ?? '';
                const currentNotes = scoringFormState[rev.taskId]?.notes ?? rev.notes ?? '';

                return (
                  <article key={rev.taskId} className="border-2 border-black p-5 bg-white space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-base">{rev.title}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 border font-mono font-bold ${
                          rev.status === 'reviewed' ? 'bg-black text-white' : 'bg-white text-black'
                        }`}
                      >
                        {rev.status === 'reviewed' ? '[ĐÃ CHẤM]' : '[CHỜ CHẤM]'}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-700 bg-neutral-50 p-3 border border-neutral-300 whitespace-pre-line">
                      <strong>Đề bài:</strong> {rev.prompt}
                    </div>

                    {/* User response */}
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide">Dàn ý bài làm của bạn:</p>
                      <div className="p-3 border-2 border-black bg-white text-sm whitespace-pre-line font-mono">
                        {rev.userText || '(Bạn chưa nhập nội dung nào khi làm bài)'}
                      </div>
                    </div>

                    {/* Rubric Table */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide">
                        Tiêu chí chấm bài (Rubric quy định trong JSON):
                      </p>
                      <div className="border border-black overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-neutral-100 border-b border-black">
                              <th className="p-2 border-r border-black font-bold">Tiêu chí</th>
                              <th className="p-2 font-bold">Yêu cầu đạt được</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rev.rubric.map((r, rIdx) => (
                              <tr key={rIdx} className="border-b border-neutral-300">
                                <td className="p-2 border-r border-black font-semibold whitespace-nowrap">
                                  {r.criterion}
                                </td>
                                <td className="p-2">{r.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sample Answer */}
                    {rev.sampleAnswer && (
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wide">Bài mẫu tham khảo:</p>
                        <div className="p-3 border border-neutral-400 bg-neutral-50 text-xs italic leading-relaxed">
                          {rev.sampleAnswer}
                        </div>
                      </div>
                    )}

                    {/* Self-grading form */}
                    <div className="border-t-2 border-black pt-4 space-y-3 bg-neutral-50 p-4">
                      <h5 className="text-sm font-bold">Đánh giá & Ghi chú chấm bài:</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label
                            htmlFor={`speaking_score_${rev.taskId}`}
                            className="block text-xs font-bold mb-1"
                          >
                            Điểm đánh giá (VD: 7.5 hoặc 8/10):
                          </label>
                          <input
                            id={`speaking_score_${rev.taskId}`}
                            type="text"
                            value={currentScore}
                            placeholder="Nhập điểm..."
                            onChange={(e) => handleScoreChange(rev.taskId, 'score', e.target.value)}
                            className="w-full p-2 border-2 border-black text-sm bg-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label
                            htmlFor={`speaking_notes_${rev.taskId}`}
                            className="block text-xs font-bold mb-1"
                          >
                            Nhận xét / Rút kinh nghiệm:
                          </label>
                          <input
                            id={`speaking_notes_${rev.taskId}`}
                            type="text"
                            value={currentNotes}
                            placeholder="Ghi chú nhận xét của bạn..."
                            onChange={(e) => handleScoreChange(rev.taskId, 'notes', e.target.value)}
                            className="w-full p-2 border-2 border-black text-sm bg-white"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveReview(currentAttempt.id, 'speaking', rev.taskId)}
                        className="px-4 py-2 bg-black text-white font-bold text-xs border border-black hover:bg-neutral-800"
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
            <h3 id="writing-results-heading" className="text-lg font-bold border-b-2 border-black pb-1">
              4. Kết quả chấm bài Writing (AI Gemini 3.8 Flash theo Rubric)
            </h3>

            <div className="space-y-6">
              {currentAttempt.writingReviews.map((rev) => {
                const currentScore = String(scoringFormState[rev.taskId]?.score ?? rev.score ?? '');
                const currentNotes = scoringFormState[rev.taskId]?.notes ?? rev.notes ?? '';
                const wordCount = rev.userText.trim() ? rev.userText.trim().split(/\s+/).length : 0;

                return (
                  <article key={rev.taskId} className="border-2 border-black p-5 bg-white space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-base">{rev.title}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 border font-mono font-bold ${
                          rev.status === 'reviewed' ? 'bg-black text-white' : 'bg-white text-black'
                        }`}
                      >
                        {rev.status === 'reviewed'
                          ? `[ĐÃ CHẤM${rev.score ? `: ${rev.score}` : ''}]`
                          : '[CHỜ CHẤM]'}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-700 bg-neutral-50 p-3 border border-neutral-300 whitespace-pre-line">
                      <strong>Đề bài:</strong> {rev.prompt}
                    </div>

                    {/* User response */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide">
                        <span>Bài viết của bạn:</span>
                        <span className="font-mono">Số từ: {wordCount}</span>
                      </div>
                      <div className="p-4 border-2 border-black bg-white text-sm whitespace-pre-line leading-relaxed font-serif">
                        {rev.userText || '(Bạn chưa viết bài luận nào khi làm bài)'}
                      </div>
                    </div>

                    {/* Rubric Table */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide">
                        Tiêu chí chấm bài (Rubric quy định trong JSON):
                      </p>
                      <div className="border border-black overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-neutral-100 border-b border-black">
                              <th className="p-2 border-r border-black font-bold">Tiêu chí</th>
                              <th className="p-2 font-bold">Yêu cầu đạt được</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rev.rubric.map((r, rIdx) => (
                              <tr key={rIdx} className="border-b border-neutral-300">
                                <td className="p-2 border-r border-black font-semibold whitespace-nowrap">
                                  {r.criterion}
                                </td>
                                <td className="p-2">{r.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sample Answer */}
                    {rev.sampleAnswer && (
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wide">Bài viết mẫu tham khảo:</p>
                        <div className="p-3 border border-neutral-400 bg-neutral-50 text-xs italic leading-relaxed whitespace-pre-line">
                          {rev.sampleAnswer}
                        </div>
                      </div>
                    )}

                    {/* Self-grading form */}
                    <div className="border-t-2 border-black pt-4 space-y-3 bg-neutral-50 p-4">
                      <h5 className="text-sm font-bold">Đánh giá & Ghi chú chấm bài:</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label
                            htmlFor={`writing_score_${rev.taskId}`}
                            className="block text-xs font-bold mb-1"
                          >
                            Điểm đánh giá (VD: 8.0 hoặc 85/100):
                          </label>
                          <input
                            id={`writing_score_${rev.taskId}`}
                            type="text"
                            value={currentScore}
                            placeholder="Nhập điểm..."
                            onChange={(e) => handleScoreChange(rev.taskId, 'score', e.target.value)}
                            className="w-full p-2 border-2 border-black text-sm bg-white"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label
                            htmlFor={`writing_notes_${rev.taskId}`}
                            className="block text-xs font-bold mb-1"
                          >
                            Nhận xét chi tiết (AI / Ghi chú):
                          </label>
                          <textarea
                            id={`writing_notes_${rev.taskId}`}
                            rows={6}
                            value={currentNotes}
                            placeholder="Ghi chú nhận xét của bạn..."
                            onChange={(e) => handleScoreChange(rev.taskId, 'notes', e.target.value)}
                            className="w-full p-2 border-2 border-black text-sm bg-white whitespace-pre-line"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveReview(currentAttempt.id, 'writing', rev.taskId)}
                        className="px-4 py-2 bg-black text-white font-bold text-xs border border-black hover:bg-neutral-800"
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
