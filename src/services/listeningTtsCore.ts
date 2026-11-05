import type { Part, SpeechConfig } from '@google/genai';
import type {
  ListeningAudioConfig,
  SpeakerConfig,
} from '../types/test';

export const LISTENING_TTS_MODEL = 'gemini-3.8-flash-tts';

/**
 * Returns the effective Gemini TTS model ID.
 * Defaults to `gemini-3.8-flash-tts` for flagship studio audio fidelity,
 * or reads `GEMINI_TTS_MODEL` from environment if explicitly overridden.
 */
export function getListeningTtsModel(): string {
  return process.env.GEMINI_TTS_MODEL?.trim() || LISTENING_TTS_MODEL;
}

const DEFAULT_SAMPLE_RATE = 24000;

// Full library of 30 official Google Gemini Studio voices
export const GOOGLE_PREBUILT_VOICES = {
  female: [
    'Kore',         // Firm, clear, professional
    'Aoede',        // Breezy, natural, conversational
    'Autonoe',      // Warm, expressive
    'Leda',         // Polite, elegant
    'Callirrhoe',   // Bright, youthful
    'Despina',      // Gentle, friendly
    'Erinome',      // Articulate, neutral
    'Laomedeia',    // Clear, calm
    'Sadaltager',   // Resonant, mature
    'Sulafat',      // Soft, patient
    'Pulcherrima',  // Energetic, expressive
    'Vindemiatrix', // Deep, measured
  ],
  male: [
    'Puck',         // Upbeat, energetic, conversational
    'Charon',       // Informative, deep, steady, news/academic
    'Fenrir',       // Dynamic, excitable
    'Zephyr',       // Calm, warm, friendly
    'Orus',         // Confident, professional
    'Umbriel',      // Relaxed, natural
    'Schedar',      // Direct, clear
    'Achird',       // Authoritative, formal
    'Sadachbia',    // Measured, storytelling
    'Enceladus',    // Resonant, broadcast
    'Algieba',      // Clear announcer
    'Algenib',      // Friendly guide
    'Achernar',     // Deep, serious
    'Gacrux',       // Crisp, precise
    'Zubenelgenubi',// Firm, corporate
    'Iapetus',      // Scholarly, measured
    'Rasalgethi',   // Casual, contemporary
    'Alnilam',      // Storyteller, rhythmic
  ],
} as const;

export const ALL_PREBUILT_VOICE_NAMES = [
  ...GOOGLE_PREBUILT_VOICES.female,
  ...GOOGLE_PREBUILT_VOICES.male,
];

export interface DialogueTurn {
  speaker: string;
  text: string;
}

export interface InlineAudioPart {
  data: string;
  mimeType?: string;
}

export interface ListeningPartTtsInput {
  transcript: string;
  audioConfig?: ListeningAudioConfig;
  speakers?: SpeakerConfig[];
}

export interface ResolvedSpeakerProfile {
  name: string;
  gender: 'female' | 'male';
  voiceName: string;
  style?: string;
}

export function inferGender(speakerName: string): 'female' | 'male' | 'unknown' {
  const lower = speakerName.trim().toLowerCase();
  if (
    /\b(woman|female|girl|waitress|lady|mom|mother|sister|daughter|mrs|ms|miss|chloe|maria|sarah|elena|jane|anna|lisa|emma|lucy|sophie|olivia|emily|hannah|claire|jessica|rachel)\b/.test(
      lower
    ) ||
    /(女|妈妈|母亲|妹妹|姐姐|女儿|妻子|太太|女士|小红|李娜|王芳|老师)/.test(lower)
  ) {
    return 'female';
  }
  if (
    /\b(man|male|boy|waiter|sir|mr|dad|father|brother|son|sam|liam|daniel|mark|david|leo|joe|john|tom|alex|michael|peter|james|robert|paul|richard|george|steve)\b/.test(
      lower
    ) ||
    /(男|爸爸|父亲|弟弟|哥哥|儿子|丈夫|先生|大卫|王明|张勇|李明|小明|小马)/.test(lower)
  ) {
    return 'male';
  }
  return 'unknown';
}

/**
 * Robust transcript dialogue parser.
 * Handles:
 * - Speaker turns: "Speaker: Text"
 * - Multi-line continuations
 * - Skips pure stage directions like "[Sound effect]" or "(At the station)"
 * - Falls back to single-speaker if no speaker headers exist.
 */
export function parseTranscriptDialogue(transcript: string): {
  speakers: string[];
  turns: DialogueTurn[];
} {
  const lines = transcript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const speakers: string[] = [];
  const turns: DialogueTurn[] = [];
  const speakerRegex = /^([\p{L}\p{N}_'\-.\(\) ]{1,48})[:：]\s*(.+)$/u;

  for (const line of lines) {
    // Skip purely bracketed stage directions e.g. [Bell rings] or (Scene 1)
    if (/^(\[[^\]]+\]|\([^)]+\))$/.test(line)) {
      continue;
    }

    const match = line.match(speakerRegex);
    if (match) {
      const rawSpeaker = match[1].trim();
      const text = match[2].trim();

      // Normalize speaker name (title case or trimmed)
      const existingSpeaker = speakers.find(
        (s) => s.toLowerCase() === rawSpeaker.toLowerCase()
      );
      const speaker = existingSpeaker || rawSpeaker;

      if (!existingSpeaker) {
        speakers.push(speaker);
      }
      turns.push({ speaker, text });
    } else if (turns.length > 0) {
      // Continuation of previous speaker turn
      turns[turns.length - 1].text += ` ${line}`;
    }
  }

  // If no "Speaker: " format detected, treat as single-speaker announcement
  if (turns.length === 0 && lines.length > 0) {
    const singleSpeaker = 'Announcer';
    return {
      speakers: [singleSpeaker],
      turns: [{ speaker: singleSpeaker, text: lines.join(' ') }],
    };
  }

  return { speakers, turns };
}

/**
 * Resolves standard ISO 639-1 / BCP-47 language code for Google GenAI speechConfig.
 * Grounding the request in a specific language code ensures phonetic consistency
 * and prevents dialect drift across British, American, Australian, or Chinese examinations.
 */
export function resolveLanguageCode(
  audioConfig?: ListeningAudioConfig,
  transcript?: string
): string {
  if (audioConfig?.accent) {
    switch (audioConfig.accent) {
      case 'british':
        return 'en-GB';
      case 'american':
        return 'en-US';
      case 'australian':
        return 'en-AU';
      case 'canadian':
        return 'en-CA';
      case 'standard':
        return 'en-US';
    }
  }

  // Detect Chinese characters in transcript or style
  if (
    (transcript && /[\u4e00-\u9fa5]/.test(transcript)) ||
    (audioConfig?.overallStyle && /(普通话|中文|汉语|chinese|mandarin)/i.test(audioConfig.overallStyle))
  ) {
    return 'zh-CN';
  }

  return 'en-US';
}

/**
 * Builds standard style prompt directive from scenario, accent, and pacing.
 * Integrates Google Gemini 3.8 acoustic staging (reverberation, close-mic presence, PA projection).
 */
export function buildAudioStyleDirective(
  audioConfig?: ListeningAudioConfig,
  speakerStyle?: string
): string | undefined {
  const fragments: string[] = [];

  // Accent directive with acoustic resonance
  if (audioConfig?.accent) {
    switch (audioConfig.accent) {
      case 'british':
        fragments.push('authentic British English RP accent, crisp Received Pronunciation articulation');
        break;
      case 'american':
        fragments.push('General American accent, clear natural Midwestern phonetics');
        break;
      case 'australian':
        fragments.push('natural Australian English accent, gentle inflection');
        break;
      case 'canadian':
        fragments.push('standard Canadian English accent, articulate delivery');
        break;
      case 'standard':
        if (!audioConfig.overallStyle || !/(普通话|中文|汉语|chinese|mandarin)/i.test(audioConfig.overallStyle)) {
          fragments.push('clear neutral international English accent');
        }
        break;
    }
  }

  // Acoustic Scenario & Environmental Atmosphere
  if (audioConfig?.scenario) {
    switch (audioConfig.scenario) {
      case 'public_announcement':
        fragments.push('public address loudspeaker announcement, acoustic hall reverberation, clear projection, authoritative cadence');
        break;
      case 'everyday_dialogue':
        fragments.push('intimate conversational room acoustic, natural speech dynamics, friendly enunciation, expressive cadence');
        break;
      case 'interview':
        fragments.push('soundproof broadcast studio acoustics, close-mic vocal warmth, articulate and attentive dialogue');
        break;
      case 'academic_lecture':
        fragments.push('university lecture hall acoustics, moderate room reverb, clear vocal projection, measured instructional pacing');
        break;
      case 'group_discussion':
        fragments.push('meeting room acoustic, collaborative exchange, lively conversational interaction');
        break;
      case 'news_broadcast':
        fragments.push('professional broadcast news booth acoustic, crisp neutral delivery, informative and steady timbre');
        break;
    }
  }

  // Pacing directive
  if (audioConfig?.pacing) {
    switch (audioConfig.pacing) {
      case 'slow':
        fragments.push('deliberate slow speaking rate with distinct sentence boundaries for language learners');
        break;
      case 'moderate':
        fragments.push('moderate conversational speaking tempo with natural phrase breaks');
        break;
      case 'fast':
        fragments.push('fluent native speaking tempo with authentic contractions and rhythm');
        break;
      case 'exam_standard':
        fragments.push('balanced examination testing pace, articulate enunciation, clear breath intervals');
        break;
    }
  }

  if (audioConfig?.overallStyle) {
    fragments.push(audioConfig.overallStyle);
  }

  if (speakerStyle) {
    fragments.push(speakerStyle);
  }

  return fragments.length > 0 ? fragments.join(', ') : undefined;
}

/**
 * Resolves distinct voice assignments for N speakers.
 * Prioritizes author explicit config -> gender match -> distinct non-overlapping voices from 30-voice catalog.
 */
export function resolveSpeakerProfiles(
  detectedSpeakers: string[],
  declaredSpeakers?: SpeakerConfig[]
): ResolvedSpeakerProfile[] {
  const usedVoiceNames = new Set<string>();
  const declaredMap = new Map<string, SpeakerConfig>();

  if (declaredSpeakers) {
    for (const s of declaredSpeakers) {
      declaredMap.set(s.name.trim().toLowerCase(), s);
    }
  }

  const result: ResolvedSpeakerProfile[] = [];

  let femaleIndex = 0;
  let maleIndex = 0;

  detectedSpeakers.forEach((speakerName, index) => {
    const declared = declaredMap.get(speakerName.trim().toLowerCase());

    // Determine gender
    let gender: 'female' | 'male' = 'female';
    if (declared?.gender && declared.gender !== 'unspecified') {
      gender = declared.gender;
    } else {
      const inferred = inferGender(speakerName);
      if (inferred !== 'unknown') {
        gender = inferred;
      } else {
        // Alternate gender if unknown
        gender = index % 2 === 0 ? 'male' : 'female';
      }
    }

    // Determine voiceName
    let voiceName = declared?.voiceName;
    if (voiceName && (ALL_PREBUILT_VOICE_NAMES as readonly string[]).includes(voiceName)) {
      usedVoiceNames.add(voiceName);
    } else {
      const pool = gender === 'female' ? GOOGLE_PREBUILT_VOICES.female : GOOGLE_PREBUILT_VOICES.male;
      let candidate: string | undefined;

      // Find unused voice from preferred pool
      for (let i = 0; i < pool.length; i++) {
        const ptr = (gender === 'female' ? femaleIndex + i : maleIndex + i) % pool.length;
        if (!usedVoiceNames.has(pool[ptr])) {
          candidate = pool[ptr];
          if (gender === 'female') femaleIndex = ptr + 1;
          else maleIndex = ptr + 1;
          break;
        }
      }

      // Fallback if all in pool were used
      if (!candidate) {
        candidate = pool[index % pool.length];
      }

      voiceName = candidate;
      usedVoiceNames.add(voiceName);
    }

    result.push({
      name: speakerName,
      gender,
      voiceName,
      style: declared?.style,
    });
  });

  return result;
}

/**
 * Builds Google GenAI TTS request params.
 * Adheres strictly to Google GenAI TTS specifications:
 * - Uses `gemini-3.8-flash-tts` by default for studio-grade acoustic fidelity.
 * - Sets `temperature: 0.7` for rich natural prosody and responsive inline vocal tags.
 * - Injects `languageCode` (e.g. `en-GB`, `en-US`, `zh-CN`) to anchor phonetics and prevent accent drift.
 * - Adheres strictly to the Google MultiSpeakerVoiceConfig constraint: exactly two speaker voice configs.
 */
export function buildListeningTtsRequest(
  input: string | ListeningPartTtsInput
): {
  model: string;
  contents: string | Part[];
  config: {
    responseModalities: string[];
    speechConfig: SpeechConfig;
    temperature: number;
  };
} {
  const transcript = typeof input === 'string' ? input : input.transcript;
  const audioConfig = typeof input === 'string' ? undefined : input.audioConfig;
  const declaredSpeakers = typeof input === 'string' ? undefined : input.speakers;

  const { speakers, turns } = parseTranscriptDialogue(transcript);
  const resolvedSpeakers = resolveSpeakerProfiles(speakers, declaredSpeakers);
  const speakerProfileMap = new Map(resolvedSpeakers.map((s) => [s.name, s]));
  const languageCode = resolveLanguageCode(audioConfig, transcript);

  const isMultiSpeaker = resolvedSpeakers.length >= 2;

  // Google MultiSpeakerVoiceConfig strictly requires exactly two speaker voice configurations.
  let activeTwoSpeakers: ResolvedSpeakerProfile[] = [];
  const speakerAliasMapping = new Map<string, string>();

  if (isMultiSpeaker) {
    // Count turns per speaker to prioritize the two primary conversationalists
    const speakerTurnCounts = new Map<string, number>();
    for (const turn of turns) {
      speakerTurnCounts.set(turn.speaker, (speakerTurnCounts.get(turn.speaker) || 0) + 1);
    }

    const sortedSpeakers = [...resolvedSpeakers].sort(
      (a, b) => (speakerTurnCounts.get(b.name) || 0) - (speakerTurnCounts.get(a.name) || 0)
    );

    activeTwoSpeakers = sortedSpeakers.slice(0, 2);
    const primaryNames = new Set(activeTwoSpeakers.map((s) => s.name));

    // Map any minor auxiliary characters (e.g., a waiter with 1 line) to one of the 2 primary voice slots
    for (const s of resolvedSpeakers) {
      if (primaryNames.has(s.name)) {
        speakerAliasMapping.set(s.name, s.name);
      } else {
        const genderMatch =
          activeTwoSpeakers.find((prim) => prim.gender === s.gender) || activeTwoSpeakers[0];
        speakerAliasMapping.set(s.name, genderMatch.name);
      }
    }
  }

  // Build Turn Parts with speechMetadata
  const contents: string | Part[] = turns.map((turn) => {
    const profile = speakerProfileMap.get(turn.speaker);
    const turnStyle = buildAudioStyleDirective(audioConfig, profile?.style);
    const effectiveSpeaker = isMultiSpeaker
      ? (speakerAliasMapping.get(turn.speaker) || activeTwoSpeakers[0]?.name || turn.speaker)
      : turn.speaker;

    return {
      text: turn.text,
      speechMetadata: {
        speaker: effectiveSpeaker,
        ...(turnStyle ? { style: turnStyle } : {}),
      },
    };
  });

  // Build SpeechConfig according to speaker count and languageCode
  const speechConfig: SpeechConfig = isMultiSpeaker
    ? {
      languageCode,
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: activeTwoSpeakers.map((s) => ({
          speaker: s.name,
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: s.voiceName },
          },
        })),
      },
    }
    : {
      languageCode,
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: resolvedSpeakers[0]?.voiceName || 'Kore',
        },
      },
    };

  return {
    model: getListeningTtsModel(),
    contents,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig,
      temperature: 0.7,
    },
  };
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binaryString = globalThis.atob(base64);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function parseSampleRate(mimeType?: string): number {
  if (!mimeType) return DEFAULT_SAMPLE_RATE;
  const match = mimeType.match(/rate=(\d+)/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (parsed > 0) return parsed;
  }
  return DEFAULT_SAMPLE_RATE;
}

function hasRiffWavHeader(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength > 44 &&
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 // 'F'
  );
}

export interface ParsedWavAudio {
  pcmBytes: Uint8Array;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  audioFormat: number;
}

/**
 * Robustly parses a RIFF WAVE container and extracts purely the PCM audio samples
 * from the 'data' chunk.
 * 
 * Crucially strips trailing metadata chunks (such as Google Gemini's 6KB+ C2PA
 * authenticity manifest) which otherwise gets treated as 16-bit PCM samples
 * and produces loud white noise bursts at the end of audio files.
 */
export function extractPcmFromWav(wavBytes: Uint8Array): ParsedWavAudio {
  const fallback: ParsedWavAudio = {
    pcmBytes: wavBytes.byteLength > 44 ? wavBytes.subarray(44) : wavBytes,
    sampleRate: DEFAULT_SAMPLE_RATE,
    channels: 1,
    bitsPerSample: 16,
    audioFormat: 1,
  };

  if (wavBytes.byteLength < 12) {
    return fallback;
  }

  const isLittleEndian =
    wavBytes[0] === 0x52 &&
    wavBytes[1] === 0x49 &&
    wavBytes[2] === 0x46 &&
    wavBytes[3] === 0x46; // "RIFF"

  const isBigEndian =
    wavBytes[0] === 0x52 &&
    wavBytes[1] === 0x49 &&
    wavBytes[2] === 0x46 &&
    wavBytes[3] === 0x58; // "RIFX"

  if (!isLittleEndian && !isBigEndian) {
    return fallback;
  }

  const isWave =
    wavBytes[8] === 0x57 &&
    wavBytes[9] === 0x41 &&
    wavBytes[10] === 0x56 &&
    wavBytes[11] === 0x45; // "WAVE"

  if (!isWave) {
    return fallback;
  }

  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  const le = isLittleEndian;

  let offset = 12;
  let sampleRate = DEFAULT_SAMPLE_RATE;
  let channels = 1;
  let bitsPerSample = 16;
  let audioFormat = 1;
  let pcmBytes: Uint8Array | null = null;

  while (offset + 8 <= wavBytes.byteLength) {
    const chunkId = String.fromCharCode(
      wavBytes[offset],
      wavBytes[offset + 1],
      wavBytes[offset + 2],
      wavBytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, le);
    const dataOffset = offset + 8;
    const safeChunkSize = Math.max(0, Math.min(chunkSize, wavBytes.byteLength - dataOffset));

    if (chunkId === 'fmt ') {
      if (safeChunkSize >= 16) {
        audioFormat = view.getUint16(dataOffset, le);
        channels = view.getUint16(dataOffset + 2, le);
        const parsedRate = view.getUint32(dataOffset + 4, le);
        if (parsedRate >= 8000 && parsedRate <= 192000) {
          sampleRate = parsedRate;
        }
        bitsPerSample = view.getUint16(dataOffset + 14, le);
      }
    } else if (chunkId === 'data') {
      pcmBytes = wavBytes.subarray(dataOffset, dataOffset + safeChunkSize);
    }

    // RIFF chunk payload is word-aligned (padded to an even number of bytes)
    const paddedSize = (chunkSize + 1) & ~1;
    offset += 8 + paddedSize;
  }

  return {
    pcmBytes: pcmBytes || (wavBytes.byteLength > 44 ? wavBytes.subarray(44) : wavBytes),
    sampleRate,
    channels: channels || 1,
    bitsPerSample: bitsPerSample || 16,
    audioFormat,
  };
}

export function pcm16ToWavBytes(
  pcmBytes: Uint8Array,
  sampleRate: number
): Uint8Array<ArrayBuffer> {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBytes.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, 44);
  return wavBytes;
}

export function combineAudioPartsToWavBytes(parts: InlineAudioPart[]): {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
} {
  if (parts.length === 1) {
    const rawBytes = base64ToUint8Array(parts[0].data);
    const mimeType = parts[0].mimeType || '';
    const alreadyWav = hasRiffWavHeader(rawBytes);

    if (alreadyWav) {
      // Re-package clean WAV bytes: extracts exact PCM from data chunk,
      // eliminating trailing C2PA signature chunks or other non-audio metadata.
      const parsed = extractPcmFromWav(rawBytes);
      return {
        bytes: pcm16ToWavBytes(parsed.pcmBytes, parsed.sampleRate),
        mimeType: 'audio/wav',
      };
    }

    const isOtherPlayable = /^audio\/(mpeg|mp3|ogg|webm)/i.test(mimeType);
    if (isOtherPlayable) {
      return {
        bytes: rawBytes,
        mimeType,
      };
    }

    return {
      bytes: pcm16ToWavBytes(rawBytes, parseSampleRate(mimeType)),
      mimeType: 'audio/wav',
    };
  }

  const pcmChunks: Uint8Array[] = [];
  let totalLength = 0;
  let detectedSampleRate = parseSampleRate(parts[0]?.mimeType);

  for (const part of parts) {
    const bytes = base64ToUint8Array(part.data);
    if (hasRiffWavHeader(bytes)) {
      const parsed = extractPcmFromWav(bytes);
      pcmChunks.push(parsed.pcmBytes);
      totalLength += parsed.pcmBytes.byteLength;
      if (parsed.sampleRate > 0) {
        detectedSampleRate = parsed.sampleRate;
      }
    } else {
      pcmChunks.push(bytes);
      totalLength += bytes.byteLength;
    }
  }

  const combinedPcm = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of pcmChunks) {
    combinedPcm.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    bytes: pcm16ToWavBytes(combinedPcm, detectedSampleRate),
    mimeType: 'audio/wav',
  };
}
