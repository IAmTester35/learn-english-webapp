import type {
  Question,
  QuestionResult,
  SectionScore,
  TestAttempt,
  TestDocument,
  UserAnswers,
  DeferredTaskReview,
} from '../types/test';

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Accurately counts words for Latin-based languages and characters for CJK (Chinese, Japanese, Korean) languages.
 * For mixed texts, sums CJK characters and whitespace-separated non-CJK words.
 */
export function countWordsOrCharacters(text?: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  // CJK Unified Ideographs, Extension A, Hiragana, Katakana, Hangul
  const cjkMatches = trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  // Strip CJK characters and count remaining words separated by whitespace
  const nonCjk = trimmed.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g, ' ').trim();
  const nonCjkWords = nonCjk ? nonCjk.split(/\s+/).filter(Boolean).length : 0;
  return cjkCount + nonCjkWords;
}

export function isCjkText(text?: string): boolean {
  if (!text) return false;
  return /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/.test(text);
}

export function gradeQuestion(question: Question, rawUserAnswer: string | string[] | undefined): QuestionResult {
  const userAnswer = rawUserAnswer ?? (question.type === 'multiple_select' ? [] : '');

  switch (question.type) {
    case 'multiple_choice': {
      const selected = typeof userAnswer === 'string' ? userAnswer.trim() : '';
      const isCorrect = selected === question.correctAnswer;
      const targetOpt = question.options.find((o) => o.id === question.correctAnswer);
      const userOpt = question.options.find((o) => o.id === selected);
      return {
        questionId: question.id,
        type: question.type,
        prompt: question.prompt,
        userAnswer: userOpt ? `${userOpt.id}. ${userOpt.text}` : selected || '(Chưa trả lời)',
        correctAnswerSummary: targetOpt ? `${targetOpt.id}. ${targetOpt.text}` : question.correctAnswer,
        isCorrect,
        explanation: question.explanation,
      };
    }

    case 'multiple_select': {
      const selected = Array.isArray(userAnswer) ? userAnswer : [];
      const correctSet = new Set(question.correctAnswers);
      const isCorrect =
        selected.length === question.correctAnswers.length &&
        selected.every((ans) => correctSet.has(ans));

      const formatOptions = (ids: string[]) =>
        ids
          .map((id) => {
            const opt = question.options.find((o) => o.id === id);
            return opt ? `${opt.id}. ${opt.text}` : id;
          })
          .join('; ');

      return {
        questionId: question.id,
        type: question.type,
        prompt: question.prompt,
        userAnswer: selected.length > 0 ? formatOptions(selected) : '(Chưa chọn)',
        correctAnswerSummary: formatOptions(question.correctAnswers),
        isCorrect,
        explanation: question.explanation,
      };
    }

    case 'fill_blank': {
      const input = typeof userAnswer === 'string' ? normalizeText(userAnswer) : '';
      const isCorrect = question.acceptedAnswers.some((accepted) => {
        const normAccepted = normalizeText(accepted);
        if (question.caseSensitive) {
          return input === normAccepted;
        }
        return input.toLowerCase() === normAccepted.toLowerCase();
      });

      return {
        questionId: question.id,
        type: question.type,
        prompt: question.prompt,
        userAnswer: input || '(Bỏ trống)',
        correctAnswerSummary: question.acceptedAnswers.join(' HOẶC '),
        isCorrect,
        explanation: question.explanation,
      };
    }

    case 'true_false_ng': {
      const selected = typeof userAnswer === 'string' ? userAnswer.trim() : '';
      const isCorrect = selected === question.correctAnswer;
      return {
        questionId: question.id,
        type: question.type,
        prompt: question.prompt,
        userAnswer: selected || '(Chưa chọn)',
        correctAnswerSummary: question.correctAnswer,
        isCorrect,
        explanation: question.explanation,
      };
    }
  }
}

export function gradeQuestionsList(
  questions: Question[],
  userMap: Record<string, string | string[]>
): SectionScore {
  const results = questions.map((q) => gradeQuestion(q, userMap[q.id]));
  const correctCount = results.filter((r) => r.isCorrect).length;
  return {
    correctCount,
    totalCount: questions.length,
    results,
  };
}

export function gradeTestAttempt(test: TestDocument, answers: UserAnswers): TestAttempt {
  // 1. Reading
  const readingQuestions: Question[] = [];
  test.sections.reading.passages.forEach((p) => readingQuestions.push(...p.questions));
  const readingScore = gradeQuestionsList(readingQuestions, answers.reading);

  // 2. Listening
  const listeningQuestions: Question[] = [];
  test.sections.listening.parts.forEach((p) => listeningQuestions.push(...p.questions));
  const listeningScore = gradeQuestionsList(listeningQuestions, answers.listening);

  // 3. Speaking reviews
  const speakingReviews: DeferredTaskReview[] = test.sections.speaking.tasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    prompt: task.prompt,
    userText: answers.speaking[task.id] || '',
    rubric: task.rubric,
    sampleAnswer: task.sampleAnswer,
    status: 'pending_review',
  }));

  // 4. Writing reviews
  const writingReviews: DeferredTaskReview[] = test.sections.writing.tasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    prompt: task.prompt,
    userText: answers.writing[task.id] || '',
    rubric: task.rubric,
    sampleAnswer: task.sampleAnswer,
    status: 'pending_review',
  }));

  return {
    id: `attempt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    testId: test.id,
    testTitle: test.title,
    submittedAt: new Date().toISOString(),
    scores: {
      reading: readingScore,
      listening: listeningScore,
    },
    speakingReviews,
    writingReviews,
  };
}
