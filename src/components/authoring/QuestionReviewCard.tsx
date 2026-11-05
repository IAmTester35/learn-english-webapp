import React from 'react';
import type { Question } from '@/types/test';

function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'multiple_choice':
      return 'Trắc nghiệm (1 đáp án)';
    case 'multiple_select':
      return 'Chọn nhiều đáp án';
    case 'fill_blank':
      return 'Điền từ';
    case 'true_false_ng':
      return 'True / False / Not Given';
    default:
      return type;
  }
}

interface QuestionReviewCardProps {
  question: Question;
  index: number;
}

export const QuestionReviewCard: React.FC<QuestionReviewCardProps> = ({ question, index }) => {
  return (
    <div className="border border-neutral-300 p-2 bg-[#fffdf5] space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="font-bold text-black">Câu {index + 1}</span>
          <span className="text-neutral-500">({question.id})</span>
        </div>
        <span className="font-mono text-neutral-600 bg-[#f4eed9] px-1 py-0.2 border border-neutral-300 text-[10px]">
          {getQuestionTypeLabel(question.type)}
        </span>
      </div>

      <div className="font-medium text-neutral-900 leading-snug">
        {question.prompt}
      </div>

      {question.type === 'multiple_choice' && (
        <div className="space-y-0.5 pt-0.5">
          {question.options?.map((opt) => {
            const isCorrect = opt.id === question.correctAnswer;
            return (
              <div
                key={opt.id}
                className={`p-1 border flex items-center justify-between text-xs ${
                  isCorrect
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold'
                    : 'bg-white border-neutral-200 text-neutral-700'
                }`}
              >
                <span>{opt.id}. {opt.text}</span>
                {isCorrect && <span className="text-[10px] text-emerald-700 font-bold">Đúng</span>}
              </div>
            );
          })}
        </div>
      )}

      {question.type === 'multiple_select' && (
        <div className="space-y-0.5 pt-0.5">
          {question.options?.map((opt) => {
            const isCorrect = question.correctAnswers?.includes(opt.id);
            return (
              <div
                key={opt.id}
                className={`p-1 border flex items-center justify-between text-xs ${
                  isCorrect
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold'
                    : 'bg-white border-neutral-200 text-neutral-700'
                }`}
              >
                <span>{opt.id}. {opt.text}</span>
                {isCorrect && <span className="text-[10px] text-emerald-700 font-bold">Đúng</span>}
              </div>
            );
          })}
        </div>
      )}

      {question.type === 'fill_blank' && (
        <div className="p-1 border border-emerald-600 bg-emerald-50 text-xs text-emerald-950">
          <span className="font-semibold">Đáp án: </span>
          <span>{question.acceptedAnswers?.join(' / ')}</span>
        </div>
      )}

      {question.type === 'true_false_ng' && (
        <div className="flex items-center gap-1 pt-0.5 font-mono text-xs">
          {(['TRUE', 'FALSE', 'NOT_GIVEN'] as const).map((choice) => {
            const isCorrect = choice === question.correctAnswer;
            return (
              <span
                key={choice}
                className={`px-1.5 py-0.5 border text-[10px] ${
                  isCorrect
                    ? 'bg-emerald-600 text-white border-black font-bold'
                    : 'bg-white text-neutral-600 border-neutral-300'
                }`}
              >
                {choice}
              </span>
            );
          })}
        </div>
      )}

      {question.explanation && (
        <p className="text-[11px] text-neutral-500 italic pt-0.5">
          Giải thích: {question.explanation}
        </p>
      )}
    </div>
  );
};
