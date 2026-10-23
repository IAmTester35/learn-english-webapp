import 'server-only';
import { ThinkingLevel, Type } from '@google/genai';
import type { RubricItem } from '../types/test';
import { withGeminiClientFallback } from './gemini';
import { countWordsOrCharacters, isCjkText } from '../domain/grader';

const WRITING_GRADER_MODEL = 'gemini-3.8-flash';

export interface WritingAiGradeResult {
  score: string;
  notes: string;
}

export async function gradeSingleWritingTaskWithAi(params: {
  title: string;
  prompt: string;
  minWords?: number;
  rubric: RubricItem[];
  userText: string;
}): Promise<WritingAiGradeResult> {
  const trimmedAnswer = params.userText.trim();
  if (!trimmedAnswer) {
    return {
      score: '0/10',
      notes: 'Thí sinh chưa nhập bài làm cho phần thi này.',
    };
  }

  const wordCount = countWordsOrCharacters(trimmedAnswer);
  const isCjk = isCjkText(params.prompt + trimmedAnswer);
  const langLabel = isCjk ? 'tiếng Trung' : 'tiếng Anh';
  const unitLabel = isCjk ? 'chữ' : 'từ';

  const rubricText = params.rubric
    .map((r, idx) => `${idx + 1}. ${r.criterion}: ${r.description}`)
    .join('\n');

  const evaluationPrompt = [
    `Bạn là giám khảo chấm thi Writing ${langLabel} khách quan và chính xác.`,
    'Hãy chấm bài viết của thí sinh dựa trên Đề bài (Prompt) và Tiêu chí chấm điểm (Rubric) dưới đây theo thang điểm 10 (cho phép điểm lẻ tới 0.5, ví dụ: 7.5).',
    '',
    `### Tiêu đề: ${params.title}`,
    `### Đề bài (Prompt):\n${params.prompt}`,
    params.minWords
      ? `### Số ${unitLabel} tối thiểu yêu cầu: ${params.minWords} ${unitLabel} (Bài làm hiện tại: ${wordCount} ${unitLabel})`
      : `### Số ${unitLabel} bài làm: ${wordCount} ${unitLabel}`,
    `### Tiêu chí chấm điểm (Rubric):\n${rubricText}`,
    `### Bài làm của thí sinh (User Response):\n${trimmedAnswer}`,
    '',
    'Trả về JSON gồm:',
    '- score: Điểm số trên thang 10 (number từ 0 đến 10).',
    '- notes: Nhận xét chi tiết bằng tiếng Việt đối chiếu từng tiêu chí trong Rubric, chỉ ra ưu điểm, lỗi sai (ngữ pháp/từ vựng/bố cục) và gợi ý sửa cụ thể.',
  ].join('\n');

  const response = await withGeminiClientFallback((client) =>
    client.models.generateContent({
      model: WRITING_GRADER_MODEL,
      contents: evaluationPrompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: {
              type: Type.NUMBER,
              description: 'Điểm số của bài viết trên thang điểm 10 (từ 0 đến 10).',
            },
            notes: {
              type: Type.STRING,
              description: 'Nhận xét chi tiết theo từng tiêu chí trong rubric và hướng dẫn cải thiện.',
            },
          },
          required: ['score', 'notes'],
        },
      },
    })
  );

  const rawText = response.text?.trim() || '{}';
  const parsed = JSON.parse(rawText) as { score?: number; notes?: string };
  const numericScore =
    typeof parsed.score === 'number' && !Number.isNaN(parsed.score)
      ? Math.max(0, Math.min(10, Math.round(parsed.score * 10) / 10))
      : 0;

  return {
    score: `${numericScore}/10`,
    notes: parsed.notes?.trim() || 'Đã chấm điểm bằng AI.',
  };
}
