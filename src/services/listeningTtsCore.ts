import type { Part, SpeechConfig } from '@google/genai';
import type {
  ListeningAudioConfig,
  SpeakerConfig,
  SpeakerGender,
} from '../types/test';

export const LISTENING_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
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
    )
  ) {
    return 'female';
  }
  if (
    /\b(man|male|boy|waiter|sir|mr|dad|father|brother|son|sam|liam|daniel|mark|david|leo|joe|john|tom|alex|michael|peter|james|robert|paul|richard|george|steve)\b/.test(
      lower
    )
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
  const speakerRegex = /^([A-Za-z0-9_'\-.\(\) ]{1,48}):\s*(.+)$/;

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
 * Builds standard style prompt directive from scenario, accent, and pacing.
 */
export function buildAudioStyleDirective(
  audioConfig?: ListeningAudioConfig,
  speakerStyle?: string
): string | undefined {
  const fragments: string[] = [];

  // Accent directive
  if (audioConfig?.accent) {
    switch (audioConfig.accent) {
      case 'british':
        fragments.push('British English RP accent');
        break;
      case 'american':
        fragments.push('General American accent');
        break;
      case 'australian':
        fragments.push('mild Australian English accent');
        break;
      case 'canadian':
        fragments.push('Canadian English accent');
        break;
      case 'standard':
        fragments.push('neutral international English accent');
        break;
    }
  }

  // Scenario directive
  if (audioConfig?.scenario) {
    switch (audioConfig.scenario) {
      case 'public_announcement':
        fragments.push('authoritative public address announcement, clear resonance, articulate');
        break;
      case 'everyday_dialogue':
        fragments.push('natural everyday conversation, friendly, clear enunciation');
        break;
      case 'interview':
        fragments.push('professional broadcast interview, polite and attentive');
        break;
      case 'academic_lecture':
        fragments.push('formal academic lecture, informative, structured pacing');
        break;
      case 'group_discussion':
        fragments.push('lively collaborative discussion, interactive turns');
        break;
      case 'news_broadcast':
        fragments.push('steady broadcast news delivery, neutral and informative');
        break;
    }
  }

  // Pacing directive
  if (audioConfig?.pacing) {
    switch (audioConfig.pacing) {
      case 'slow':
        fragments.push('speak slowly and clearly for beginner language learners');
        break;
      case 'moderate':
        fragments.push('moderate conversational speaking rate');
        break;
      case 'fast':
        fragments.push('natural fast-paced native speech');
        break;
      case 'exam_standard':
        fragments.push('clear exam standard speed with natural sentence breaks');
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
      declaredMap.set(s.name.toLowerCase(), s);
    }
  }

  const result: ResolvedSpeakerProfile[] = [];

  let femaleIndex = 0;
  let maleIndex = 0;

  detectedSpeakers.forEach((speakerName, index) => {
    const declared = declaredMap.get(speakerName.toLowerCase());

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
 * Supports N speakers (1, 2, 3, ... N) and natural delivery styling via speechMetadata.
 */
export function buildListeningTtsRequest(
  input: string | ListeningPartTtsInput
): {
  model: string;
  contents: string | Part[];
  config: {
    responseModalities: string[];
    speechConfig: SpeechConfig;
  };
} {
  const transcript = typeof input === 'string' ? input : input.transcript;
  const audioConfig = typeof input === 'string' ? undefined : input.audioConfig;
  const declaredSpeakers = typeof input === 'string' ? undefined : input.speakers;

  const { speakers, turns } = parseTranscriptDialogue(transcript);
  const resolvedSpeakers = resolveSpeakerProfiles(speakers, declaredSpeakers);
  const speakerProfileMap = new Map(resolvedSpeakers.map((s) => [s.name, s]));

  const isMultiSpeaker = resolvedSpeakers.length > 1;

  // Build Turn Parts with speechMetadata
  const contents: string | Part[] = turns.map((turn) => {
    const profile = speakerProfileMap.get(turn.speaker);
    const turnStyle = buildAudioStyleDirective(audioConfig, profile?.style);

    return {
      text: turn.text,
      speechMetadata: {
        speaker: turn.speaker,
        ...(turnStyle ? { style: turnStyle } : {}),
      },
    };
  });

  // Build SpeechConfig according to speaker count
  const speechConfig: SpeechConfig = isMultiSpeaker
    ? {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: resolvedSpeakers.map((s) => ({
            speaker: s.name,
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: s.voiceName },
            },
          })),
        },
      }
    : {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: resolvedSpeakers[0]?.voiceName || 'Kore',
          },
        },
      };

  return {
    model: LISTENING_TTS_MODEL,
    contents,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig,
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
    const isPlayableContainer =
      alreadyWav || /^audio\/(wav|x-wav|wave|mpeg|mp3|ogg|webm)/i.test(mimeType);

    if (isPlayableContainer) {
      return {
        bytes: rawBytes,
        mimeType: alreadyWav ? 'audio/wav' : mimeType,
      };
    }

    return {
      bytes: pcm16ToWavBytes(rawBytes, parseSampleRate(mimeType)),
      mimeType: 'audio/wav',
    };
  }

  const pcmChunks: Uint8Array[] = [];
  let totalLength = 0;
  const sampleRate = parseSampleRate(parts[0]?.mimeType);

  for (const part of parts) {
    const bytes = base64ToUint8Array(part.data);
    const pcmPayload = hasRiffWavHeader(bytes) ? bytes.subarray(44) : bytes;
    pcmChunks.push(pcmPayload);
    totalLength += pcmPayload.byteLength;
  }

  const combinedPcm = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of pcmChunks) {
    combinedPcm.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    bytes: pcm16ToWavBytes(combinedPcm, sampleRate),
    mimeType: 'audio/wav',
  };
}
