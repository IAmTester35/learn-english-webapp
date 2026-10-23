import 'server-only';
import { GoogleGenAI } from '@google/genai';

const clientCache = new Map<string, GoogleGenAI>();

// In-memory key health cooldown tracker (timestamp until key is cooled down)
const keyCooldownMap = new Map<string, number>();

export function getGeminiApiKeys(): string[] {
  const validKeys: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (/^GEMINI_API_KEY(_\w+)?$/i.test(key) && typeof value === 'string') {
      const trimmedVal = value.trim();
      if (trimmedVal.length > 0 && !trimmedVal.toLowerCase().startsWith('your_gemini_api_key')) {
        validKeys.push(trimmedVal);
      }
    }
  }

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

/**
 * Intelligent Fallback calling only healthy keys.
 * If a key hits 429 or network errors, it immediately fails over to the next
 * healthy key without delaying the user HTTP request (Zero-wait Failover).
 */
export async function withGeminiClientFallback<T>(
  operation: (client: GoogleGenAI) => Promise<T>
): Promise<T> {
  const allKeys = getGeminiApiKeys();
  if (allKeys.length === 0) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trong môi trường server.');
  }

  const now = Date.now();
  // Filter for healthy keys (not in cooldown)
  const healthyKeys = allKeys.filter((k) => (keyCooldownMap.get(k) || 0) <= now);
  // Fall back to all keys if all are cooling down
  const candidateKeys = healthyKeys.length > 0 ? shuffleArray(healthyKeys) : shuffleArray(allKeys);

  let lastError: unknown = null;

  for (let i = 0; i < candidateKeys.length; i++) {
    const key = candidateKeys[i];
    const client = getOrCreateClient(key);
    try {
      const result = await operation(client);
      // Key succeeded: remove from cooldown if previously degraded
      keyCooldownMap.delete(key);
      return result;
    } catch (err: unknown) {
      lastError = err;
      // Immediately place this key in cooldown for 2 minutes to prevent hammering
      keyCooldownMap.set(key, Date.now() + 2 * 60 * 1000);
      // Đổi key liền lập tức (0ms delay) để không làm trễ response của user
      continue;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Tất cả API key đều gặp sự cố hoặc đang trong thời gian hạ nhiệt (cooldown).');
}
