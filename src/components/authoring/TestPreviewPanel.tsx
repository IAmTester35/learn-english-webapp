import React, { useState } from 'react';
import type {
  TestDocument,
  ReadingPassage,
  ListeningPart,
  SpeakingTask,
  WritingTask,
  Question,
} from '@/types/test';
import { countWordsOrCharacters } from '@/domain/grader';
import { QuestionReviewCard } from './QuestionReviewCard';

interface TestPreviewPanelProps {
  parsedDoc: TestDocument | null;
}

export const TestPreviewPanel: React.FC<TestPreviewPanelProps> = ({ parsedDoc }) => {
  const [activePreviewTab, setActivePreviewTab] = useState<
    'overview' | 'reading' | 'listening' | 'speaking' | 'writing' | 'answers'
  >('overview');
  const [expandedPassageIds, setExpandedPassageIds] = useState<Record<string, boolean>>({});
  const [expandedTranscriptIds, setExpandedTranscriptIds] = useState<Record<string, boolean>>({});
  const [expandedSampleIds, setExpandedSampleIds] = useState<Record<string, boolean>>({});

  const togglePassage = (id: string) => {
    setExpandedPassageIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const toggleTranscript = (id: string) => {
    setExpandedTranscriptIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const toggleSample = (id: string) => {
    setExpandedSampleIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!parsedDoc) {
    return (
      <div className="border-2 border-black bg-[#fffdf5] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <div className="border-b border-black px-3 py-2 bg-[#f4eed9] flex items-center justify-between text-xs font-mono">
          <h3 className="font-bold text-black">Xem trước</h3>
        </div>
        <div className="p-6 text-center text-neutral-400 font-mono text-xs">
          Chưa có dữ liệu đề thi.
        </div>
      </div>
    );
  }

  const readingPassageCount = parsedDoc.sections?.reading?.passages?.length || 0;
  const readingQuestionCount =
    parsedDoc.sections?.reading?.passages?.reduce(
      (acc, p) => acc + (Array.isArray(p?.questions) ? p.questions.length : 0),
      0
    ) || 0;
  const listeningPartCount = parsedDoc.sections?.listening?.parts?.length || 0;
  const listeningQuestionCount =
    parsedDoc.sections?.listening?.parts?.reduce(
      (acc, p) => acc + (Array.isArray(p?.questions) ? p.questions.length : 0),
      0
    ) || 0;
  const speakingTaskCount = parsedDoc.sections?.speaking?.tasks?.length || 0;
  const writingTaskCount = parsedDoc.sections?.writing?.tasks?.length || 0;
  const totalQuestions = readingQuestionCount + listeningQuestionCount;

  // Flattened questions for the Answer Key Matrix
  const answerKeyMatrix: Array<{
    stt: number;
    partName: string;
    id: string;
    type: string;
    correctAnswer: string;
  }> = [];

  let sttCounter = 1;
  parsedDoc.sections?.reading?.passages?.forEach((p, pIdx) => {
    p?.questions?.forEach((q) => {
      let answerSummary = '';
      if (q.type === 'multiple_choice') answerSummary = q.correctAnswer;
      else if (q.type === 'multiple_select') answerSummary = q.correctAnswers.join(', ');
      else if (q.type === 'fill_blank') answerSummary = q.acceptedAnswers.join(' / ');
      else if (q.type === 'true_false_ng') answerSummary = q.correctAnswer;

      answerKeyMatrix.push({
        stt: sttCounter++,
        partName: `Reading P${pIdx + 1}`,
        id: q.id,
        type: q.type,
        correctAnswer: answerSummary,
      });
    });
  });

  parsedDoc.sections?.listening?.parts?.forEach((part, partIdx) => {
    part?.questions?.forEach((q) => {
      let answerSummary = '';
      if (q.type === 'multiple_choice') answerSummary = q.correctAnswer;
      else if (q.type === 'multiple_select') answerSummary = q.correctAnswers.join(', ');
      else if (q.type === 'fill_blank') answerSummary = q.acceptedAnswers.join(' / ');
      else if (q.type === 'true_false_ng') answerSummary = q.correctAnswer;

      answerKeyMatrix.push({
        stt: sttCounter++,
        partName: `Listening P${partIdx + 1}`,
        id: q.id,
        type: q.type,
        correctAnswer: answerSummary,
      });
    });
  });

  return (
    <div className="border-2 border-black bg-[#fffdf5] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
      <div className="border-b border-black px-3 py-2 bg-[#f4eed9] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 font-mono">
          <h3 className="font-bold text-black">Xem trước</h3>
          {parsedDoc.id && (
            <span className="text-[11px] bg-black text-[#fffdf5] px-1.5 py-0.2">
              {parsedDoc.id}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Meta details */}
        <div className="space-y-0.5 border-b border-neutral-200 pb-2.5">
          <h4 className="text-sm font-bold text-black">
            {parsedDoc.title || <span className="text-neutral-400 italic">Chưa có tiêu đề</span>}
          </h4>
          <p className="text-xs text-neutral-600 line-clamp-2">
            {parsedDoc.description || <span className="text-neutral-400 italic">Chưa có mô tả</span>}
          </p>
        </div>

        {/* Metrics Breakdown Grid */}
        <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
          <div className="border border-neutral-300 p-1.5 bg-[#fffdf5]">
            <div className="font-bold text-sm">{readingQuestionCount}</div>
            <div className="text-[10px] text-neutral-500">Reading</div>
          </div>
          <div className="border border-neutral-300 p-1.5 bg-[#fffdf5]">
            <div className="font-bold text-sm">{listeningQuestionCount}</div>
            <div className="text-[10px] text-neutral-500">Listening</div>
          </div>
          <div className="border border-neutral-300 p-1.5 bg-[#fffdf5]">
            <div className="font-bold text-sm">{speakingTaskCount}</div>
            <div className="text-[10px] text-neutral-500">Speaking</div>
          </div>
          <div className="border border-neutral-300 p-1.5 bg-[#fffdf5]">
            <div className="font-bold text-sm">{writingTaskCount}</div>
            <div className="text-[10px] text-neutral-500">Writing</div>
          </div>
        </div>

        {/* Section Review Tabs */}
        <div className="space-y-2.5 pt-1 border-t border-neutral-200">
          <div className="flex items-center gap-1 border-b border-neutral-300 pb-1 overflow-x-auto text-xs">
            {(
              [
                { id: 'overview', label: 'Tổng quan' },
                { id: 'reading', label: `Reading (${readingQuestionCount})` },
                { id: 'listening', label: `Listening (${listeningQuestionCount})` },
                { id: 'speaking', label: `Speaking (${speakingTaskCount})` },
                { id: 'writing', label: `Writing (${writingTaskCount})` },
                { id: 'answers', label: `Đáp án (${totalQuestions})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePreviewTab(tab.id)}
                className={`px-2 py-1 font-semibold transition-colors cursor-pointer border shrink-0 text-xs ${
                  activePreviewTab === tab.id
                    ? 'bg-black text-[#fffdf5] border-black'
                    : 'bg-[#fffdf5] text-black border-transparent hover:border-black'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Overview */}
          {activePreviewTab === 'overview' && (
            <div className="space-y-2 text-xs font-mono">
              <div className="border border-neutral-300 p-2.5 bg-[#fbf9f0] space-y-1 text-neutral-800">
                <div><strong>Mã đề:</strong> {parsedDoc.id || 'N/A'}</div>
                <div><strong>Câu trắc nghiệm:</strong> {totalQuestions}</div>
                <div><strong>Bài tự luận:</strong> {speakingTaskCount + writingTaskCount}</div>
              </div>

              <div className="space-y-1 text-xs">
                <div className="p-1.5 border border-neutral-200 bg-white flex justify-between">
                  <span>Reading</span>
                  <span className="text-neutral-600">{readingPassageCount} bài, {readingQuestionCount} câu</span>
                </div>
                <div className="p-1.5 border border-neutral-200 bg-white flex justify-between">
                  <span>Listening</span>
                  <span className="text-neutral-600">{listeningPartCount} phần, {listeningQuestionCount} câu</span>
                </div>
                <div className="p-1.5 border border-neutral-200 bg-white flex justify-between">
                  <span>Speaking</span>
                  <span className="text-neutral-600">{speakingTaskCount} bài</span>
                </div>
                <div className="p-1.5 border border-neutral-200 bg-white flex justify-between">
                  <span>Writing</span>
                  <span className="text-neutral-600">{writingTaskCount} bài</span>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Reading Details */}
          {activePreviewTab === 'reading' && (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {parsedDoc.sections?.reading?.passages?.map((passage: ReadingPassage, pIdx: number) => {
                const isExpanded = Boolean(expandedPassageIds[passage.id || `p-${pIdx}`]);
                const words = countWordsOrCharacters(passage.content);

                return (
                  <div key={passage.id || pIdx} className="border border-neutral-300 bg-[#fffdf5] p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-black">{passage.title}</span>
                      <span className="font-mono text-[11px] text-neutral-500">~{words} từ</span>
                    </div>

                    <div className="border border-neutral-200 p-2 bg-[#fbf9f0] text-xs space-y-1">
                      <p className={`whitespace-pre-wrap text-neutral-700 ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {passage.content}
                      </p>
                      <button
                        type="button"
                        onClick={() => togglePassage(passage.id || `p-${pIdx}`)}
                        className="text-[11px] font-semibold text-black underline cursor-pointer"
                      >
                        {isExpanded ? 'Thu gọn' : 'Xem thêm'}
                      </button>
                    </div>

                    <div className="space-y-2 pt-1">
                      {passage.questions?.map((q: Question, qIdx: number) => (
                        <QuestionReviewCard key={q.id || qIdx} question={q} index={qIdx} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 3: Listening Details */}
          {activePreviewTab === 'listening' && (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {parsedDoc.sections?.listening?.parts?.map((part: ListeningPart, partIdx: number) => {
                const isTranscriptExpanded = Boolean(expandedTranscriptIds[part.id || `part-${partIdx}`]);

                return (
                  <div key={part.id || partIdx} className="border border-neutral-300 bg-[#fffdf5] p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-black">{part.title}</span>
                      <span className="font-mono text-[11px] text-neutral-500">{part.questions?.length || 0} câu</span>
                    </div>

                    {part.transcript && (
                      <div className="border border-neutral-200 p-2 bg-[#fbf9f0] text-xs space-y-1">
                        <p className={`whitespace-pre-wrap font-mono text-[11px] text-neutral-700 ${isTranscriptExpanded ? '' : 'line-clamp-2'}`}>
                          {part.transcript}
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleTranscript(part.id || `part-${partIdx}`)}
                          className="text-[11px] font-semibold text-black underline cursor-pointer"
                        >
                          {isTranscriptExpanded ? 'Thu gọn' : 'Xem transcript'}
                        </button>
                      </div>
                    )}

                    <div className="space-y-2 pt-1">
                      {part.questions?.map((q: Question, qIdx: number) => (
                        <QuestionReviewCard key={q.id || qIdx} question={q} index={qIdx} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 4: Speaking Details */}
          {activePreviewTab === 'speaking' && (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {parsedDoc.sections?.speaking?.tasks?.map((task: SpeakingTask, tIdx: number) => {
                const isSampleExpanded = Boolean(expandedSampleIds[task.id || `spk-${tIdx}`]);

                return (
                  <div key={task.id || tIdx} className="border border-neutral-300 bg-[#fffdf5] p-2.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-black">{task.title}</span>
                      <span className="font-mono text-[11px] text-neutral-500">{task.id}</span>
                    </div>

                    <p className="p-2 bg-[#fbf9f0] border border-neutral-200 text-neutral-800 whitespace-pre-wrap">
                      {task.prompt}
                    </p>

                    {task.sampleAnswer && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleSample(task.id || `spk-${tIdx}`)}
                          className="text-[11px] font-semibold text-neutral-700 underline cursor-pointer"
                        >
                          {isSampleExpanded ? 'Thu gọn bài mẫu' : 'Xem bài mẫu'}
                        </button>
                        {isSampleExpanded && (
                          <p className="mt-1 p-2 bg-white border border-neutral-200 text-neutral-700 italic text-[11px]">
                            {task.sampleAnswer}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 5: Writing Details */}
          {activePreviewTab === 'writing' && (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {parsedDoc.sections?.writing?.tasks?.map((task: WritingTask, tIdx: number) => {
                const isSampleExpanded = Boolean(expandedSampleIds[task.id || `wrt-${tIdx}`]);

                return (
                  <div key={task.id || tIdx} className="border border-neutral-300 bg-[#fffdf5] p-2.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-black">{task.title}</span>
                      <span className="font-mono text-[11px] text-neutral-500">
                        {task.minWords ? `≥${task.minWords} từ` : task.id}
                      </span>
                    </div>

                    <p className="p-2 bg-[#fbf9f0] border border-neutral-200 text-neutral-800 whitespace-pre-wrap">
                      {task.prompt}
                    </p>

                    {task.sampleAnswer && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleSample(task.id || `wrt-${tIdx}`)}
                          className="text-[11px] font-semibold text-neutral-700 underline cursor-pointer"
                        >
                          {isSampleExpanded ? 'Thu gọn bài mẫu' : 'Xem bài mẫu'}
                        </button>
                        {isSampleExpanded && (
                          <p className="mt-1 p-2 bg-white border border-neutral-200 text-neutral-700 italic text-[11px]">
                            {task.sampleAnswer}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 6: Complete Answer Key Matrix */}
          {activePreviewTab === 'answers' && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 text-xs">
              <div className="border border-black overflow-x-auto bg-[#fffdf5]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-black bg-[#f4eed9] font-mono text-[11px] text-black">
                      <th className="p-1.5 border-r border-black w-10 text-center">STT</th>
                      <th className="p-1.5 border-r border-black">Phần</th>
                      <th className="p-1.5 border-r border-black">Mã</th>
                      <th className="p-1.5 font-bold">Đáp án</th>
                    </tr>
                  </thead>
                  <tbody>
                    {answerKeyMatrix.map((item) => (
                      <tr key={item.id} className="border-b border-neutral-200">
                        <td className="p-1.5 border-r border-neutral-300 font-mono text-center">
                          {item.stt}
                        </td>
                        <td className="p-1.5 border-r border-neutral-300 text-[11px]">
                          {item.partName}
                        </td>
                        <td className="p-1.5 border-r border-neutral-300 font-mono text-[11px]">
                          {item.id}
                        </td>
                        <td className="p-1.5 font-mono font-bold text-emerald-900 bg-emerald-50 text-[11px]">
                          {item.correctAnswer}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
