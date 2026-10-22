import type { TestDocument } from '../types/test';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateQuestion(q: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!q || typeof q !== 'object') {
    return [`${path}: Question must be an object.`];
  }
  const item = q as Record<string, unknown>;

  if (typeof item.id !== 'string' || !item.id.trim()) {
    errors.push(`${path}: Question id is required and must be non-empty.`);
  }
  if (typeof item.prompt !== 'string' || !item.prompt.trim()) {
    errors.push(`${path}: Question prompt is required.`);
  }

  const validTypes = ['multiple_choice', 'multiple_select', 'fill_blank', 'true_false_ng'];
  if (!validTypes.includes(item.type as string)) {
    errors.push(`${path}: Invalid question type "${item.type}". Allowed: ${validTypes.join(', ')}.`);
    return errors;
  }

  if (item.type === 'multiple_choice') {
    if (!Array.isArray(item.options) || item.options.length < 2) {
      errors.push(`${path}: multiple_choice requires at least 2 options.`);
    }
    if (typeof item.correctAnswer !== 'string' || !item.correctAnswer.trim()) {
      errors.push(`${path}: multiple_choice requires correctAnswer string.`);
    }
  } else if (item.type === 'multiple_select') {
    if (!Array.isArray(item.options) || item.options.length < 2) {
      errors.push(`${path}: multiple_select requires at least 2 options.`);
    }
    if (!Array.isArray(item.correctAnswers) || item.correctAnswers.length === 0) {
      errors.push(`${path}: multiple_select requires non-empty correctAnswers array.`);
    }
  } else if (item.type === 'fill_blank') {
    if (!Array.isArray(item.acceptedAnswers) || item.acceptedAnswers.length === 0) {
      errors.push(`${path}: fill_blank requires non-empty acceptedAnswers array.`);
    }
  } else if (item.type === 'true_false_ng') {
    const validValues = ['TRUE', 'FALSE', 'NOT_GIVEN'];
    if (!validValues.includes(item.correctAnswer as string)) {
      errors.push(`${path}: true_false_ng correctAnswer must be TRUE, FALSE, or NOT_GIVEN.`);
    }
  }

  return errors;
}

export function validateTestDocument(raw: unknown): { valid: boolean; errors: string[]; data?: TestDocument } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Root document must be a JSON object.'] };
  }
  const doc = raw as Record<string, unknown>;

  if (typeof doc.id !== 'string' || !doc.id.trim()) {
    errors.push('Test id is missing or empty.');
  }
  if (typeof doc.title !== 'string' || !doc.title.trim()) {
    errors.push('Test title is missing or empty.');
  }

  if (!doc.sections || typeof doc.sections !== 'object') {
    errors.push('Test sections object is missing.');
    return { valid: false, errors };
  }

  const sections = doc.sections as Record<string, unknown>;
  const requiredSections = ['reading', 'listening', 'speaking', 'writing'];
  for (const s of requiredSections) {
    if (!sections[s] || typeof sections[s] !== 'object') {
      errors.push(`Section "${s}" is required.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check Reading
  const reading = sections.reading as Record<string, unknown>;
  if (!Array.isArray(reading.passages)) {
    errors.push('reading.passages must be an array.');
  } else {
    reading.passages.forEach((p, pIdx) => {
      const pObj = p as Record<string, unknown>;
      const pPath = `reading.passages[${pIdx}]`;
      if (!pObj.id) errors.push(`${pPath}: passage id is missing.`);
      if (!pObj.title) errors.push(`${pPath}: passage title is missing.`);
      if (!pObj.content) errors.push(`${pPath}: passage content is missing.`);
      if (Array.isArray(pObj.questions)) {
        pObj.questions.forEach((q, qIdx) => {
          errors.push(...validateQuestion(q, `${pPath}.questions[${qIdx}]`));
        });
      } else {
        errors.push(`${pPath}: questions must be an array.`);
      }
    });
  }

  // Check Listening
  const listening = sections.listening as Record<string, unknown>;
  if (!Array.isArray(listening.parts)) {
    errors.push('listening.parts must be an array.');
  } else {
    listening.parts.forEach((part, partIdx) => {
      const partObj = part as Record<string, unknown>;
      const partPath = `listening.parts[${partIdx}]`;
      if (!partObj.id) errors.push(`${partPath}: part id is missing.`);
      if (!partObj.title) errors.push(`${partPath}: part title is missing.`);
      if (Array.isArray(partObj.questions)) {
        partObj.questions.forEach((q, qIdx) => {
          errors.push(...validateQuestion(q, `${partPath}.questions[${qIdx}]`));
        });
      } else {
        errors.push(`${partPath}: questions must be an array.`);
      }
    });
  }

  // Check Speaking
  const speaking = sections.speaking as Record<string, unknown>;
  if (!Array.isArray(speaking.tasks)) {
    errors.push('speaking.tasks must be an array.');
  } else {
    speaking.tasks.forEach((t, tIdx) => {
      const tObj = t as Record<string, unknown>;
      const tPath = `speaking.tasks[${tIdx}]`;
      if (!tObj.id) errors.push(`${tPath}: task id is missing.`);
      if (!tObj.title) errors.push(`${tPath}: task title is missing.`);
      if (!tObj.prompt) errors.push(`${tPath}: task prompt is missing.`);
      if (!Array.isArray(tObj.rubric)) errors.push(`${tPath}: rubric array is missing.`);
    });
  }

  // Check Writing
  const writing = sections.writing as Record<string, unknown>;
  if (!Array.isArray(writing.tasks)) {
    errors.push('writing.tasks must be an array.');
  } else {
    writing.tasks.forEach((t, tIdx) => {
      const tObj = t as Record<string, unknown>;
      const tPath = `writing.tasks[${tIdx}]`;
      if (!tObj.id) errors.push(`${tPath}: task id is missing.`);
      if (!tObj.title) errors.push(`${tPath}: task title is missing.`);
      if (!tObj.prompt) errors.push(`${tPath}: task prompt is missing.`);
      if (!Array.isArray(tObj.rubric)) errors.push(`${tPath}: rubric array is missing.`);
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: raw as TestDocument };
}
