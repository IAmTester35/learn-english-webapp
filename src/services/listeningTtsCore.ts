import type { Part, SpeechConfig } from '@google/genai';

export const LISTENING_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const DEFAULT_SAMPLE_RATE = 24000;

const FEMALE_VOICE_POOL = ['Kore', 'Aoede'];
const MALE_VOICE_POOL = ['Puck', 'Charon'];

export interface DialogueTurn {
  speaker: string;
  text: string;
}

export interface InlineAudioPart {
  data: string;
  mimeType?: string;
}

function inferGender(speakerName: string): 'female' | 'male' | 'unknown' {
  const lower = speakerName.trim().toLowerCase();
  if (
    /\b(woman|female|girl|waitress|lady|mom|mother|sister|maria|sarah|elena|jane|anna|lisa|emma)\b/.test(
      lower
    )
  ) {
    return 'female';
  }
  if (
    /\b(man|male|boy|waiter|sir|dad|father|brother|mark|david|leo|joe|john|tom|alex|sam)\b/.test(
      lower
    )
  ) {
    return 'male';
  }
  return 'unknown';
}

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
  const speakerRegex = /^([A-Za-z][A-Za-z0-9_ ]{0,24}):\s*(.+)$/;

  for (const line of lines) {
    const match = line.match(speakerRegex);
    if (match) {
      const speaker = match[1].trim();
      const text = match[2].trim();
      if (!speakers.includes(speaker)) {
        speakers.push(speaker);
      }
      turns.push({ speaker, text });
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += ` ${line}`;
    } else {
      return { speakers: [], turns: [] };
    }
  }

  return { speakers, turns };
}

function pickTwoSpeakerVoices(speakers: [string, string]): [string, string] {
  const g1 = inferGender(speakers[0]);
  const g2 = inferGender(speakers[1]);

  if (g1 === 'female' && g2 === 'male') {
    return [FEMALE_VOICE_POOL[0], MALE_VOICE_POOL[0]];
  }
  if (g1 === 'male' && g2 === 'female') {
    return [MALE_VOICE_POOL[0], FEMALE_VOICE_POOL[0]];
  }
  if (g1 === 'female' && g2 === 'female') {
    return [FEMALE_VOICE_POOL[0], FEMALE_VOICE_POOL[1]];
  }
  if (g1 === 'male' && g2 === 'male') {
    return [MALE_VOICE_POOL[0], MALE_VOICE_POOL[1]];
  }
  if (g1 === 'female') {
    return [FEMALE_VOICE_POOL[0], MALE_VOICE_POOL[0]];
  }
  if (g1 === 'male') {
    return [MALE_VOICE_POOL[0], FEMALE_VOICE_POOL[0]];
  }
  if (g2 === 'female') {
    return [MALE_VOICE_POOL[0], FEMALE_VOICE_POOL[0]];
  }
  if (g2 === 'male') {
    return [FEMALE_VOICE_POOL[0], MALE_VOICE_POOL[0]];
  }
  return ['Puck', 'Kore'];
}

export function buildListeningTtsRequest(transcript: string): {
  model: string;
  contents: string | Part[];
  config: {
    responseModalities: string[];
    speechConfig: SpeechConfig;
  };
} {
  const { speakers, turns } = parseTranscriptDialogue(transcript);
  const isTwoSpeakerDialogue = speakers.length === 2 && turns.length > 0;

  const contents: string | Part[] = isTwoSpeakerDialogue
    ? turns.map((turn) => ({
        text: turn.text,
        speechMetadata: {
          speaker: turn.speaker,
        },
      }))
    : transcript;

  const speechConfig: SpeechConfig = isTwoSpeakerDialogue
    ? (() => {
        const [v1, v2] = pickTwoSpeakerVoices([speakers[0], speakers[1]]);
        return {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: speakers[0],
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: v1 },
                },
              },
              {
                speaker: speakers[1],
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: v2 },
                },
              },
            ],
          },
        };
      })()
    : {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Kore',
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
