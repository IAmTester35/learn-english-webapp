export type QuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'fill_blank'
  | 'true_false_ng';

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  explanation?: string;
}

export interface Option {
  id: string;
  text: string;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple_choice';
  options: Option[];
  correctAnswer: string;
}

export interface MultipleSelectQuestion extends BaseQuestion {
  type: 'multiple_select';
  options: Option[];
  correctAnswers: string[];
}

export interface FillBlankQuestion extends BaseQuestion {
  type: 'fill_blank';
  acceptedAnswers: string[];
  caseSensitive?: boolean;
}

export interface TrueFalseNgQuestion extends BaseQuestion {
  type: 'true_false_ng';
  correctAnswer: 'TRUE' | 'FALSE' | 'NOT_GIVEN';
}

export type Question =
  | MultipleChoiceQuestion
  | MultipleSelectQuestion
  | FillBlankQuestion
  | TrueFalseNgQuestion;

export interface ReadingPassage {
  id: string;
  title: string;
  content: string;
  questions: Question[];
}

export interface ReadingSection {
  instructions: string;
  passages: ReadingPassage[];
}

export type SpeakerGender = 'female' | 'male' | 'unspecified';

export interface SpeakerConfig {
  name: string;
  gender?: SpeakerGender;
  voiceName?: string;
  style?: string;
}

export type ListeningScenario =
  | 'everyday_dialogue'
  | 'public_announcement'
  | 'interview'
  | 'academic_lecture'
  | 'group_discussion'
  | 'news_broadcast';

export type ListeningAccent =
  | 'british'
  | 'american'
  | 'australian'
  | 'canadian'
  | 'standard';

export interface ListeningAudioConfig {
  scenario?: ListeningScenario;
  accent?: ListeningAccent;
  pacing?: 'slow' | 'moderate' | 'fast' | 'exam_standard';
  overallStyle?: string;
}

export interface ListeningPart {
  id: string;
  title: string;
  audioUrl?: string;
  transcript?: string;
  audioConfig?: ListeningAudioConfig;
  speakers?: SpeakerConfig[];
  questions: Question[];
}

export interface ListeningSection {
  instructions: string;
  parts: ListeningPart[];
}

export interface RubricItem {
  criterion: string;
  description: string;
}

export interface SpeakingTask {
  id: string;
  title: string;
  prompt: string;
  rubric: RubricItem[];
  sampleAnswer?: string;
}

export interface SpeakingSection {
  instructions: string;
  tasks: SpeakingTask[];
}

export interface WritingTask {
  id: string;
  title: string;
  prompt: string;
  minWords?: number;
  rubric: RubricItem[];
  sampleAnswer?: string;
}

export interface WritingSection {
  instructions: string;
  tasks: WritingTask[];
}

export interface TestDocument {
  schemaVersion: string;
  id: string;
  title: string;
  description: string;
  sections: {
    reading: ReadingSection;
    listening: ListeningSection;
    speaking: SpeakingSection;
    writing: WritingSection;
  };
}

export interface TestCatalogItem {
  id: string;
  title: string;
  description: string;
  file: string;
}

export interface TestCatalog {
  tests: TestCatalogItem[];
}

// User Responses
export interface UserAnswers {
  reading: Record<string, string | string[]>;
  listening: Record<string, string | string[]>;
  speaking: Record<string, string>; // task.id -> notes / speech outline
  writing: Record<string, string>; // task.id -> essay text
}

// Evaluation Results
export interface QuestionResult {
  questionId: string;
  type: QuestionType;
  prompt: string;
  userAnswer: string | string[];
  correctAnswerSummary: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface SectionScore {
  correctCount: number;
  totalCount: number;
  results: QuestionResult[];
}

export interface DeferredTaskReview {
  taskId: string;
  title: string;
  prompt: string;
  userText: string;
  rubric: RubricItem[];
  sampleAnswer?: string;
  status: 'pending_review' | 'reviewed';
  score?: number | string;
  notes?: string;
}

export interface TestAttempt {
  id: string;
  testId: string;
  testTitle: string;
  submittedAt: string;
  scores: {
    reading: SectionScore;
    listening: SectionScore;
  };
  speakingReviews: DeferredTaskReview[];
  writingReviews: DeferredTaskReview[];
}

export type SkillSection = 'reading' | 'listening' | 'speaking' | 'writing';

export interface TestProgress {
  testId: string;
  testTitle: string;
  lastActiveSection: SkillSection;
  answers: UserAnswers;
  updatedAt: string;
  answeredCount: number;
  totalCount: number;
}

