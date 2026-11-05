import 'server-only';
import type { GoogleGenAI } from '@google/genai';
import {
  executeWithGeminiKeyRotation,
  loadEnvGeminiKeys,
} from './geminiKeyManager';

export function getGeminiApiKeys(): string[] {
  return loadEnvGeminiKeys().map((k) => k.apiKey);
}

export function hasGeminiApiKey(): boolean {
  return true;
}

/**
 * Delegates to the unified Supabase-backed Gemini Key Rotation Manager (SSOT).
 */
export async function withGeminiClientFallback<T>(
  operation: (client: GoogleGenAI) => Promise<T>
): Promise<T> {
  return executeWithGeminiKeyRotation((client) => operation(client));
}
