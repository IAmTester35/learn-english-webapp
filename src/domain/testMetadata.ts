import crypto from 'node:crypto';
import type {
  ListeningPart,
  SkillSection,
  TestAudioAssetMetadata,
  TestDocument,
  TestMetadataSummary,
} from '../types/test';
import {
  getListeningTtsModel,
  parseTranscriptDialogue,
  resolveLanguageCode,
  resolveSpeakerProfiles,
} from '../services/listeningTtsCore';

export interface ExtractedTestDatabaseMetadata extends TestMetadataSummary {
  metadataJson: Record<string, unknown>;
}

/**
 * Infers language ('en' | 'zh'), exam system ('CEFR' | 'HSK'), and proficiency level
 * from a TestDocument's id, title, and description.
 */
export function inferTestClassification(doc: Pick<TestDocument, 'id' | 'title' | 'description'>): {
  language: 'en' | 'zh' | 'other';
  examSystem: 'CEFR' | 'HSK' | 'OTHER';
  level: string;
} {
  const idLower = (doc.id || '').toLowerCase();
  const combined = `${doc.id} ${doc.title} ${doc.description}`;
  const isChinese =
    idLower.startsWith('hsk') ||
    /[\u4e00-\u9fa5]/.test(doc.title || '') ||
    /[\u4e00-\u9fa5]/.test(doc.description || '');

  if (isChinese) {
    const hskMatch = combined.match(/HSK[\s_-]*([1-6])|([1-6])\s*级/i);
    const levelNum = hskMatch ? hskMatch[1] || hskMatch[2] : '2';
    return {
      language: 'zh',
      examSystem: 'HSK',
      level: `HSK ${levelNum}`,
    };
  }

  const upper = combined.toUpperCase();
  let level = 'B1';
  if (idLower.startsWith('a1') || /\bA1\b/.test(upper)) level = 'A1';
  else if (idLower.startsWith('a2') || /\bA2\b|\bKEY\b|\bKET\b/.test(upper)) level = 'A2';
  else if (idLower.startsWith('b1-plus') || /\bB1\+/.test(upper)) level = 'B1+';
  else if (idLower.startsWith('b1') || /\bB1\b|\bPET\b/.test(upper)) level = 'B1';
  else if (idLower.startsWith('b2') || /\bB2\b|\bFCE\b/.test(upper)) level = 'B2';
  else if (idLower.startsWith('c1') || /\bC1\b|\bCAE\b/.test(upper)) level = 'C1';
  else if (idLower.startsWith('c2') || /\bC2\b|\bCPE\b/.test(upper)) level = 'C2';

  return {
    language: 'en',
    examSystem: 'CEFR',
    level,
  };
}

/**
 * Extracts comprehensive relational and JSONB metadata from a validated TestDocument.
 */
export function extractTestDocumentMetadata(doc: TestDocument): ExtractedTestDatabaseMetadata {
  const { language, examSystem, level } = inferTestClassification(doc);

  const passages = doc.sections?.reading?.passages || [];
  const readingPassageCount = passages.length;
  const readingQuestionCount = passages.reduce(
    (sum, p) => sum + (Array.isArray(p.questions) ? p.questions.length : 0),
    0
  );

  const listeningParts = doc.sections?.listening?.parts || [];
  const listeningPartCount = listeningParts.length;
  const listeningQuestionCount = listeningParts.reduce(
    (sum, p) => sum + (Array.isArray(p.questions) ? p.questions.length : 0),
    0
  );

  const speakingTasks = doc.sections?.speaking?.tasks || [];
  const speakingTaskCount = speakingTasks.length;

  const writingTasks = doc.sections?.writing?.tasks || [];
  const writingTaskCount = writingTasks.length;

  const totalQuestions = readingQuestionCount + listeningQuestionCount;

  const partsWithTranscript = listeningParts.filter(
    (p) => typeof p.transcript === 'string' && p.transcript.trim().length > 0
  );
  const audioReadyCount = listeningParts.filter(
    (p) => typeof p.audioUrl === 'string' && p.audioUrl.trim().length > 0
  ).length;

  const audioComplete =
    partsWithTranscript.length === 0 || audioReadyCount >= partsWithTranscript.length;

  const sectionsAvailable: SkillSection[] = ['reading', 'listening'];
  if (speakingTaskCount > 0) sectionsAvailable.push('speaking');
  if (writingTaskCount > 0) sectionsAvailable.push('writing');

  // Estimate test duration in minutes based on structure
  const estimatedDurationMinutes = Math.max(
    15,
    Math.round(
      readingQuestionCount * 1.2 +
        listeningPartCount * 4 +
        speakingTaskCount * 5 +
        writingTaskCount * 15
    )
  );

  // Breakdown of question types
  const questionTypeBreakdown: Record<string, number> = {
    multiple_choice: 0,
    multiple_select: 0,
    fill_blank: 0,
    true_false_ng: 0,
  };
  for (const p of passages) {
    for (const q of p.questions || []) {
      questionTypeBreakdown[q.type] = (questionTypeBreakdown[q.type] || 0) + 1;
    }
  }
  for (const part of listeningParts) {
    for (const q of part.questions || []) {
      questionTypeBreakdown[q.type] = (questionTypeBreakdown[q.type] || 0) + 1;
    }
  }

  const listeningPartsSummary = listeningParts.map((part, idx) => ({
    id: part.id,
    index: idx,
    title: part.title,
    questionCount: Array.isArray(part.questions) ? part.questions.length : 0,
    hasTranscript: Boolean(part.transcript && part.transcript.trim().length > 0),
    hasAudio: Boolean(part.audioUrl && part.audioUrl.trim().length > 0),
    audioUrl: part.audioUrl || null,
    scenario: part.audioConfig?.scenario || null,
    accent: part.audioConfig?.accent || null,
    pacing: part.audioConfig?.pacing || null,
  }));

  const metadataJson: Record<string, unknown> = {
    schemaVersion: doc.schemaVersion || '1.0.0',
    language,
    examSystem,
    level,
    sectionsAvailable,
    readingPassageCount,
    readingQuestionCount,
    listeningPartCount,
    listeningQuestionCount,
    speakingTaskCount,
    writingTaskCount,
    totalQuestions,
    audioReadyCount,
    audioRequiredCount: partsWithTranscript.length,
    audioComplete,
    estimatedDurationMinutes,
    questionTypeBreakdown,
    listeningPartsSummary,
  };

  return {
    language,
    examSystem,
    level,
    readingPassageCount,
    readingQuestionCount,
    listeningPartCount,
    listeningQuestionCount,
    speakingTaskCount,
    writingTaskCount,
    totalQuestions,
    audioReadyCount,
    audioComplete,
    estimatedDurationMinutes,
    sectionsAvailable,
    metadataJson,
  };
}

/**
 * Computes a deterministic SHA-256 hash of a listening part's transcript and voice settings.
 * Explicitly normalizes nested object key order so PostgreSQL JSONB key sorting never alters the hash.
 */
export function computeListeningTranscriptHash(part: ListeningPart): string {
  const cfg = part.audioConfig;
  const normalizedAudioConfig = cfg
    ? {
        accent: cfg.accent || null,
        overallStyle: cfg.overallStyle || null,
        pacing: cfg.pacing || null,
        scenario: cfg.scenario || null,
      }
    : null;

  const normalizedSpeakers = Array.isArray(part.speakers)
    ? part.speakers.map((s) => ({
        gender: s.gender || null,
        name: (s.name || '').trim(),
        style: s.style || null,
        voiceName: s.voiceName || null,
      }))
    : null;

  const payload = JSON.stringify({
    transcript: (part.transcript || '').trim(),
    audioConfig: normalizedAudioConfig,
    speakers: normalizedSpeakers,
  });
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Estimates audio duration in seconds from byte size and format/bitrate.
 */
export function estimateAudioDurationSeconds(params: {
  byteLength: number;
  format: 'mp3' | 'wav';
  bitrateKbps?: number;
  sampleRate?: number;
  channels?: number;
}): number {
  const {
    byteLength,
    format,
    bitrateKbps = 192,
    sampleRate = 24000,
    channels = 1,
  } = params;

  if (byteLength <= 44) return 0;

  if (format === 'wav') {
    const bytesPerSecond = sampleRate * channels * 2; // 16-bit PCM
    return Math.round(((byteLength - 44) / bytesPerSecond) * 100) / 100;
  }

  // MP3 duration from CBR bitrate (in kbps -> bytes/sec = kbps * 1000 / 8)
  const bytesPerSecond = (bitrateKbps * 1000) / 8;
  return Math.round((byteLength / bytesPerSecond) * 100) / 100;
}

/**
 * Builds standardized metadata record for `public.test_audio` table.
 */
export function buildListeningAudioMetadata(params: {
  testId: string;
  part: ListeningPart;
  partIndex: number;
  storageBucket: string;
  storagePath: string;
  publicUrl: string;
  format: 'mp3' | 'wav';
  fileSizeBytes: number;
  bitrateKbps?: number;
  sampleRate?: number;
  ttsModel?: string;
}): TestAudioAssetMetadata {
  const {
    testId,
    part,
    partIndex,
    storageBucket,
    storagePath,
    publicUrl,
    format,
    fileSizeBytes,
    bitrateKbps = format === 'mp3' ? 192 : 384,
    sampleRate = 24000,
    ttsModel = getListeningTtsModel(),
  } = params;

  const transcript = (part.transcript || '').trim();
  const { speakers: detectedSpeakers, turns } = parseTranscriptDialogue(transcript);
  const resolvedSpeakers = resolveSpeakerProfiles(detectedSpeakers, part.speakers);
  const languageCode = resolveLanguageCode(part.audioConfig, transcript);
  const transcriptHash = computeListeningTranscriptHash(part);
  const durationSeconds = estimateAudioDurationSeconds({
    byteLength: fileSizeBytes,
    format,
    bitrateKbps,
    sampleRate,
    channels: 1,
  });

  return {
    testId,
    partId: part.id,
    partIndex,
    partTitle: part.title || part.id,
    storageBucket,
    storagePath,
    publicUrl,
    mimeType: format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
    format,
    fileSizeBytes,
    durationSeconds,
    sampleRate,
    bitrateKbps,
    channels: 1,
    languageCode,
    scenario: part.audioConfig?.scenario,
    accent: part.audioConfig?.accent,
    pacing: part.audioConfig?.pacing,
    speakers: resolvedSpeakers,
    transcriptHash,
    transcriptCharCount: transcript.length,
    turnCount: turns.length,
    ttsModel,
  };
}
