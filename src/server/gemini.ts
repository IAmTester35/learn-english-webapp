import 'server-only';
import { GoogleGenAI } from '@google/genai';

const clientCache = new Map<string, GoogleGenAI>();

export function getGeminiApiKeys(): string[] {
  const rawKeys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY,
    // Backwards compatibility with VITE_ prefix if still present
    process.env.VITE_GEMINI_API_KEY_1,
    process.env.VITE_GEMINI_API_KEY_2,
    process.env.VITE_GEMINI_API_KEY_3,
    process.env.VITE_GEMINI_API_KEY_4,
    process.env.VITE_GEMINI_API_KEY,
  ];

  const validKeys = rawKeys
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter((k) => k.length > 0 && !k.startsWith('your_gemini_api_key'));

  return Array.from(new Set(validKeys));
}

export function hasGeminiApiKey(): boolean {
  return getGeminiApiKeys().length > 0;
}

function getOrCreateClient(apiKey: string): GoogleGenAI {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clientCache.set(apiKey, client);
  }
  return client;
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function withGeminiClientFallback<T>(
  operation: (client: GoogleGenAI) => Promise<T>
): Promise<T> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY_1..4 trong môi trường server.');
  }

  const shuffledKeys = shuffleArray(keys);
  let lastError: unknown = null;

  for (let i = 0; i < shuffledKeys.length; i++) {
    const key = shuffledKeys[i];
    const client = getOrCreateClient(key);
    try {
      return await operation(client);
    } catch (err) {
      lastError = err;
      console.warn(
        `Gemini API key (${i + 1}/${shuffledKeys.length}) gặp lỗi, thử key tiếp theo...`,
        err
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Tất cả Gemini API key đều thất bại.');
}
