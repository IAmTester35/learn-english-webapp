import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import {
  buildListeningTtsRequest,
  combineAudioPartsToWavBytes,
} from '../src/services/listeningTtsCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const TESTS_DIR = path.join(ROOT_DIR, 'public', 'tests');
const AUDIO_DIR = path.join(TESTS_DIR, 'audio');

function loadEnvKeys(): string[] {
  const envMap: Record<string, string> = {};

  if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      envMap[key] = val;
    }
  }

  const candidates = [
    process.env.GEMINI_API_KEY_1 || envMap.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2 || envMap.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3 || envMap.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4 || envMap.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY || envMap.GEMINI_API_KEY,
    process.env.VITE_GEMINI_API_KEY_1 || envMap.VITE_GEMINI_API_KEY_1,
    process.env.VITE_GEMINI_API_KEY_2 || envMap.VITE_GEMINI_API_KEY_2,
    process.env.VITE_GEMINI_API_KEY_3 || envMap.VITE_GEMINI_API_KEY_3,
    process.env.VITE_GEMINI_API_KEY_4 || envMap.VITE_GEMINI_API_KEY_4,
    process.env.VITE_GEMINI_API_KEY || envMap.VITE_GEMINI_API_KEY,
  ];

  const valid = candidates
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter((k) => k.length > 0 && !k.startsWith('your_gemini_api_key'));

  return Array.from(new Set(valid));
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function generateWithFallback(
  keys: string[],
  transcript: string
): Promise<Uint8Array> {
  const shuffled = shuffle(keys);
  const requestParams = buildListeningTtsRequest(transcript);
  let lastError: unknown = null;

  for (let i = 0; i < shuffled.length; i++) {
    const client = new GoogleGenAI({ apiKey: shuffled[i] });
    try {
      const response = await client.models.generateContent(requestParams);
      const parts =
        response.candidates?.[0]?.content?.parts
          ?.map((p) => p.inlineData)
          .filter((d): d is { data: string; mimeType?: string } => Boolean(d?.data)) || [];

      if (parts.length === 0) {
        throw new Error('API không trả về inlineData audio.');
      }

      const { bytes } = combineAudioPartsToWavBytes(parts);
      return bytes;
    } catch (err) {
      lastError = err;
      console.warn(
        `  [WARN] Key (${i + 1}/${shuffled.length}) lỗi, thử key tiếp theo...`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Tất cả API key đều thất bại.');
}

interface ListeningPartJson {
  id: string;
  title: string;
  audioUrl?: string;
  transcript?: string;
}

interface TestJson {
  id: string;
  sections?: {
    listening?: {
      parts?: ListeningPartJson[];
    };
  };
}

async function main() {
  const force = process.argv.includes('--force');
  const keys = loadEnvKeys();

  if (keys.length === 0) {
    console.error(
      '❌ Không tìm thấy API key nào trong file .env (VITE_GEMINI_API_KEY_1..4).'
    );
    process.exit(1);
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const files = fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json');

  for (const file of files) {
    const filePath = path.join(TESTS_DIR, file);
    const fileBase = path.basename(file, '.json');
    const rawJson = fs.readFileSync(filePath, 'utf-8');
    const doc = JSON.parse(rawJson) as TestJson;
    const parts = doc.sections?.listening?.parts || [];
    let modified = false;

    console.log(`\n📄 Đang kiểm tra đề: ${file}`);

    for (const part of parts) {
      if (!part.transcript?.trim()) {
        continue;
      }

      const audioFileName = `${fileBase}-${part.id}.wav`;
      const audioDiskPath = path.join(AUDIO_DIR, audioFileName);
      const publicAudioUrl = `/tests/audio/${audioFileName}`;

      const fileExists =
        fs.existsSync(audioDiskPath) && fs.statSync(audioDiskPath).size > 44;

      if (fileExists && !force) {
        console.log(`  ⏭️  [SKIP] Đã có sẵn: ${publicAudioUrl}`);
        if (part.audioUrl !== publicAudioUrl) {
          part.audioUrl = publicAudioUrl;
          modified = true;
        }
        continue;
      }

      console.log(`  🎙️  Đang tạo TTS cho ${part.id} (${part.title})...`);
      const wavBytes = await generateWithFallback(keys, part.transcript);
      fs.writeFileSync(audioDiskPath, wavBytes);
      part.audioUrl = publicAudioUrl;
      modified = true;
      console.log(
        `  ✅ Đã lưu: ${publicAudioUrl} (${(wavBytes.byteLength / 1024).toFixed(1)} KB)`
      );
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
      console.log(`💾 Đã cập nhật audioUrl trong ${file}`);
    }
  }

  console.log('\n🎉 Hoàn tất tạo file âm thanh Listening!');
}

main().catch((err) => {
  console.error('❌ Lỗi khi tạo TTS:', err);
  process.exit(1);
});
