import type { SkillSection } from './test';

export interface TestProgressSummary {
  testId: string;
  testTitle: string;
  lastActiveSection: SkillSection;
  updatedAt: string;
  answeredCount: number;
  totalCount: number;
}

export interface TestAttemptSummary {
  id: string;
  testId: string;
  testTitle: string;
  submittedAt: string;
  readingScore: string;
  listeningScore: string;
}
