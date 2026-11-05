import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type GeminiKeyStatus = 'healthy' | 'cooldown' | 'dead' | 'disabled';

export interface GeminiKeyPublicInfo {
  id: string;
  label: string;
  keyMasked: string;
  status: GeminiKeyStatus;
  cooldownUntil: string | null;
  lastUsedAt: string | null;
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastErrorCode: number | null;
  lastErrorMessage: string | null;
  successCount: number;
  rateLimitCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

interface GeminiKeyRow {
  id: string;
  label: string;
  key_masked: string;
  key_hash: string;
  encrypted_key: string;
  status: GeminiKeyStatus;
  cooldown_until: string | null;
  last_used_at: string | null;
  last_checked_at: string | null;
  last_latency_ms: number | null;
  last_error_code: number | null;
  last_error_message: string | null;
  success_count: number;
  rate_limit_count: number;
  error_count: number;
  created_at: string;
  updated_at: string;
}

// Cache GoogleGenAI client instances per decrypted key
const clientCache = new Map<string, GoogleGenAI>();
// In-memory fallback cooldown tracker when DB is unreachable
const memoryCooldownMap = new Map<string, number>();
// Track keys currently executing requests to avoid parallel collision between workers
const inFlightKeys = new Set<string>();
let keyRobinOffset = 0;

export function getOrCreateGenAIClient(apiKey: string): GoogleGenAI {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clientCache.set(apiKey, client);
  }
  return client;
}

function getEncryptionKeyBuffer(): Buffer {
  const rawSecret =
    process.env.KEY_ENCRYPTION_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'l-testlab-supabase-gemini-key-secret-2026';
  return crypto.scryptSync(rawSecret, 'l-testlab-salt-v1', 32);
}

export function encryptApiKey(plainKey: string): string {
  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey.trim(), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptApiKey(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Định dạng mã hóa Gemini API Key không hợp lệ.');
  }
  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getEncryptionKeyBuffer();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function hashApiKey(plainKey: string): string {
  return crypto.createHash('sha256').update(plainKey.trim()).digest('hex');
}

export function maskApiKey(plainKey: string): string {
  const clean = plainKey.trim();
  if (clean.length <= 12) {
    return `${clean.slice(0, 3)}...${clean.slice(-2)}`;
  }
  return `${clean.slice(0, 7)}...${clean.slice(-4)}`;
}

export function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; code?: number; statusCode?: number; message?: string };
  if (anyErr.status === 429 || anyErr.code === 429 || anyErr.statusCode === 429) {
    return true;
  }
  const msg = (anyErr.message || String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('too many requests')
  );
}

export function isTimeoutError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { name?: string; message?: string };
  if (anyErr.name === 'TimeoutError' || anyErr.name === 'AbortError') return true;
  const msg = (anyErr.message || String(err)).toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out');
}

export function isFatalError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; code?: number; statusCode?: number; message?: string };
  if (anyErr.status === 401 || anyErr.status === 403) {
    return true;
  }
  const msg = (anyErr.message || String(err)).toLowerCase();
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('permission_denied') ||
    msg.includes('unauthorized')
  );
}

function mapRowToPublicInfo(row: GeminiKeyRow): GeminiKeyPublicInfo {
  const now = Date.now();
  const cooldownExp = row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0;
  const effectiveStatus: GeminiKeyStatus =
    row.status === 'cooldown' && cooldownExp <= now ? 'healthy' : row.status;

  return {
    id: row.id,
    label: row.label,
    keyMasked: row.key_masked,
    status: effectiveStatus,
    cooldownUntil: effectiveStatus === 'cooldown' ? row.cooldown_until : null,
    lastUsedAt: row.last_used_at,
    lastCheckedAt: row.last_checked_at,
    lastLatencyMs: row.last_latency_ms,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    successCount: Number(row.success_count || 0),
    rateLimitCount: Number(row.rate_limit_count || 0),
    errorCount: Number(row.error_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Reads any GEMINI_API_KEY* from process.env / .env files for initial seeding or fallback.
 */
export function loadEnvGeminiKeys(): Array<{ label: string; apiKey: string }> {
  const envMap: Record<string, string> = {};
  const rootDir = process.cwd();
  const envFiles = [path.join(rootDir, '.env'), path.join(rootDir, '.env.local')];

  for (const envFile of envFiles) {
    if (fs.existsSync(/*turbopackIgnore: true*/ envFile)) {
      try {
        const content = fs.readFileSync(/*turbopackIgnore: true*/ envFile, 'utf-8');
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
          if (key && val) {
            envMap[key] = val;
          }
        }
      } catch {
        // ignore read error
      }
    }
  }

  const merged: Record<string, string | undefined> = { ...envMap, ...process.env };
  const result: Array<{ label: string; apiKey: string }> = [];
  const seen = new Set<string>();

  for (const [key, value] of Object.entries(merged)) {
    if (/^GEMINI_API_KEY(_\w+)?$/i.test(key) && typeof value === 'string') {
      const trimmedVal = value.trim();
      if (
        trimmedVal.length > 0 &&
        !trimmedVal.toLowerCase().startsWith('your_gemini_api_key') &&
        !seen.has(trimmedVal)
      ) {
        seen.add(trimmedVal);
        result.push({ label: key, apiKey: trimmedVal });
      }
    }
  }

  return result;
}

let hasCheckedEnvSeed = false;

/**
 * Automatically seeds keys from .env into Supabase `gemini_api_keys` if the table is empty.
 * Uses in-memory caching to avoid redundant queries on subsequent requests.
 */
export async function ensureEnvKeysSeededInSupabase(): Promise<void> {
  if (hasCheckedEnvSeed) return;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  try {
    const { count, error } = await supabase
      .from('gemini_api_keys')
      .select('id', { count: 'exact', head: true });

    if (error || (count !== null && count > 0)) {
      hasCheckedEnvSeed = true;
      return;
    }

    const envKeys = loadEnvGeminiKeys();
    if (envKeys.length === 0) {
      hasCheckedEnvSeed = true;
      return;
    }

    const rowsToInsert = envKeys.map((item) => ({
      label: item.label,
      key_masked: maskApiKey(item.apiKey),
      key_hash: hashApiKey(item.apiKey),
      encrypted_key: encryptApiKey(item.apiKey),
      status: 'healthy' as GeminiKeyStatus,
    }));

    await supabase.from('gemini_api_keys').upsert(rowsToInsert, {
      onConflict: 'key_hash',
    });
    hasCheckedEnvSeed = true;
  } catch {
    // Ignore seed errors if table is not migrated yet
  }
}

/**
 * Lists all Gemini keys stored in Supabase for the Admin UI.
 */
export async function listGeminiKeysForAdmin(): Promise<GeminiKeyPublicInfo[]> {
  await ensureEnvKeysSeededInSupabase();
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('gemini_api_keys')
    .select(
      'id, label, key_masked, status, cooldown_until, last_used_at, last_checked_at, last_latency_ms, last_error_code, last_error_message, success_count, rate_limit_count, error_count, created_at, updated_at'
    )
    .order('created_at', { ascending: true });

  if (error || !data) {
    throw new Error(error?.message || 'Không thể tải danh sách Gemini API Keys từ Supabase.');
  }

  return (data as GeminiKeyRow[]).map(mapRowToPublicInfo);
}

/**
 * Adds a new Gemini API key (or updates existing if identical hash) in Supabase DB.
 */
export async function addGeminiKeyToSupabase(params: {
  apiKey: string;
  label?: string;
}): Promise<GeminiKeyPublicInfo> {
  const cleanKey = params.apiKey.trim();
  if (cleanKey.length < 10) {
    throw new Error('Gemini API Key không hợp lệ (quá ngắn).');
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase Admin.');
  }

  const keyHash = hashApiKey(cleanKey);
  const keyMasked = maskApiKey(cleanKey);
  const encryptedKey = encryptApiKey(cleanKey);
  const cleanLabel = params.label?.trim() || `GEMINI_KEY_${keyMasked.slice(-4)}`;

  const { data, error } = await supabase
    .from('gemini_api_keys')
    .upsert(
      {
        label: cleanLabel,
        key_masked: keyMasked,
        key_hash: keyHash,
        encrypted_key: encryptedKey,
        status: 'healthy',
        cooldown_until: null,
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key_hash' }
    )
    .select(
      'id, label, key_masked, status, cooldown_until, last_used_at, last_checked_at, last_latency_ms, last_error_code, last_error_message, success_count, rate_limit_count, error_count, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Không thể lưu Gemini API Key vào Supabase.');
  }

  return mapRowToPublicInfo(data as GeminiKeyRow);
}

/**
 * Deletes a Gemini API key by ID from Supabase DB.
 */
export async function deleteGeminiKeyFromSupabase(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase Admin.');
  }

  const { error } = await supabase.from('gemini_api_keys').delete().eq('id', id);
  if (error) {
    throw new Error(error.message || 'Không thể xóa Gemini API Key.');
  }
}

/**
 * Toggles a key between 'disabled' and 'healthy'.
 */
export async function toggleGeminiKeyStatusInSupabase(
  id: string,
  disabled: boolean
): Promise<GeminiKeyPublicInfo> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase Admin.');
  }

  const { data, error } = await supabase
    .from('gemini_api_keys')
    .update({
      status: disabled ? 'disabled' : 'healthy',
      cooldown_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(
      'id, label, key_masked, status, cooldown_until, last_used_at, last_checked_at, last_latency_ms, last_error_code, last_error_message, success_count, rate_limit_count, error_count, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Không thể cập nhật trạng thái key.');
  }

  return mapRowToPublicInfo(data as GeminiKeyRow);
}

/**
 * Resets all cooldown / dead keys back to 'healthy'.
 */
export async function resetAllKeyCooldownsInSupabase(): Promise<void> {
  memoryCooldownMap.clear();
  inFlightKeys.clear();
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from('gemini_api_keys')
    .update({
      status: 'healthy',
      cooldown_until: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .in('status', ['cooldown', 'dead']);
}

/**
 * Performs an active health probe on a single Gemini API key in Supabase.
 */
export async function probeSingleGeminiKeyHealth(id: string): Promise<GeminiKeyPublicInfo> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Chưa cấu hình kết nối Supabase Admin.');
  }

  const { data: row, error: fetchErr } = await supabase
    .from('gemini_api_keys')
    .select('id, label, encrypted_key, status, success_count, rate_limit_count, error_count')
    .eq('id', id)
    .single();

  if (fetchErr || !row) {
    throw new Error('Không tìm thấy Gemini API Key cần kiểm tra.');
  }

  const typedRow = row as GeminiKeyRow;
  const plainKey = decryptApiKey(typedRow.encrypted_key);
  const client = getOrCreateGenAIClient(plainKey);

  const startMs = Date.now();
  let newStatus: GeminiKeyStatus = 'healthy';
  let cooldownUntil: string | null = null;
  let errorCode: number | null = null;
  let errorMessage: string | null = null;

  try {
    await Promise.race([
      client.models.countTokens({
        model: 'gemini-2.5-flash',
        contents: 'healthcheck',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          const e = new Error('Health check timed out after 15s');
          e.name = 'TimeoutError';
          reject(e);
        }, 15_000)
      ),
    ]);
  } catch (err: unknown) {
    const anyErr = err as { status?: number; code?: number; message?: string };
    errorCode = anyErr.status || anyErr.code || 500;
    errorMessage = (anyErr.message || String(err)).slice(0, 300);

    if (isFatalError(err)) {
      newStatus = 'dead';
    } else if (isRateLimitError(err) || isTimeoutError(err)) {
      newStatus = 'cooldown';
      cooldownUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    } else {
      newStatus = 'cooldown';
      cooldownUntil = new Date(Date.now() + 60 * 1000).toISOString();
    }
  }

  const latencyMs = Date.now() - startMs;
  const nowIso = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from('gemini_api_keys')
    .update({
      status: typedRow.status === 'disabled' ? 'disabled' : newStatus,
      cooldown_until: cooldownUntil,
      last_checked_at: nowIso,
      last_latency_ms: latencyMs,
      last_error_code: errorCode,
      last_error_message: errorMessage,
      success_count:
        newStatus === 'healthy'
          ? Number(typedRow.success_count || 0) + 1
          : Number(typedRow.success_count || 0),
      rate_limit_count:
        newStatus === 'cooldown' && isRateLimitError({ status: errorCode, message: errorMessage || '' })
          ? Number(typedRow.rate_limit_count || 0) + 1
          : Number(typedRow.rate_limit_count || 0),
      error_count:
        newStatus !== 'healthy'
          ? Number(typedRow.error_count || 0) + 1
          : Number(typedRow.error_count || 0),
      updated_at: nowIso,
    })
    .eq('id', id)
    .select(
      'id, label, key_masked, status, cooldown_until, last_used_at, last_checked_at, last_latency_ms, last_error_code, last_error_message, success_count, rate_limit_count, error_count, created_at, updated_at'
    )
    .single();

  if (updateErr || !updated) {
    throw new Error(updateErr?.message || 'Không thể lưu kết quả Health Check.');
  }

  return mapRowToPublicInfo(updated as GeminiKeyRow);
}

/**
 * Probes all non-disabled Gemini keys in parallel and returns updated statuses.
 */
export async function probeAllGeminiKeysHealth(): Promise<GeminiKeyPublicInfo[]> {
  const keys = await listGeminiKeysForAdmin();
  const activeTargets = keys.filter((k) => k.status !== 'disabled');

  await Promise.allSettled(activeTargets.map((k) => probeSingleGeminiKeyHealth(k.id)));
  return listGeminiKeysForAdmin();
}

interface CandidateKeyItem {
  id?: string;
  label: string;
  plainKey: string;
  row?: GeminiKeyRow;
}

async function getCandidateKeysForExecution(): Promise<CandidateKeyItem[]> {
  await ensureEnvKeysSeededInSupabase();
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    const { data, error } = await supabase
      .from('gemini_api_keys')
      .select('id, label, encrypted_key, status, cooldown_until, success_count, error_count, rate_limit_count')
      .neq('status', 'disabled')
      .neq('status', 'dead');

    if (!error && data && data.length > 0) {
      const rows = data as GeminiKeyRow[];
      const now = Date.now();
      const healthy: CandidateKeyItem[] = [];
      const cooling: Array<{ item: CandidateKeyItem; expiresAt: number }> = [];

      for (const row of rows) {
        try {
          const plainKey = decryptApiKey(row.encrypted_key);
          const expiresAt = row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0;
          if (row.status === 'healthy' || expiresAt <= now) {
            healthy.push({ id: row.id, label: row.label, plainKey, row });
          } else {
            cooling.push({
              item: { id: row.id, label: row.label, plainKey, row },
              expiresAt,
            });
          }
        } catch {
          // Skip key with corrupted encryption
        }
      }

      if (healthy.length > 0) {
        // Round-robin xoay vòng để chia đều tải giữa các luồng
        keyRobinOffset = (keyRobinOffset + 1) % healthy.length;
        const rotated = [
          ...healthy.slice(keyRobinOffset),
          ...healthy.slice(0, keyRobinOffset),
        ];
        // Ưu tiên key đang hoàn toàn rảnh (không bị worker khác chiếm dụng cùng lúc)
        const idle = rotated.filter((c) => !inFlightKeys.has(c.plainKey));
        const busy = rotated.filter((c) => inFlightKeys.has(c.plainKey));
        return [...idle, ...busy];
      }

      cooling.sort((a, b) => a.expiresAt - b.expiresAt);
      return cooling.map((c) => c.item);
    }
  }

  // Fallback to env keys if DB has no keys yet
  const envKeys = loadEnvGeminiKeys();
  const now = Date.now();
  const healthy = envKeys.filter((k) => (memoryCooldownMap.get(k.apiKey) || 0) <= now);
  const pool = healthy.length > 0 ? healthy : envKeys;
  if (pool.length > 0) {
    keyRobinOffset = (keyRobinOffset + 1) % pool.length;
    const rotated = [
      ...pool.slice(keyRobinOffset),
      ...pool.slice(0, keyRobinOffset),
    ];
    const idle = rotated.filter((k) => !inFlightKeys.has(k.apiKey));
    const busy = rotated.filter((c) => inFlightKeys.has(c.apiKey));
    return [...idle, ...busy].map((k) => ({ label: k.label, plainKey: k.apiKey }));
  }
  return [];
}

export interface KeyRotationOptions {
  isStopRequested?: () => boolean;
}

/**
 * Unified Zero-Wait Failover executor across all active Gemini keys in Supabase.
 * Used by both Writing AI Grader and Listening TTS Generator.
 */
export async function executeWithGeminiKeyRotation<T>(
  operation: (client: GoogleGenAI, keyLabel: string) => Promise<T>,
  options?: KeyRotationOptions
): Promise<T> {
  if (options?.isStopRequested?.()) {
    throw new Error('Đã nhận tín hiệu dừng an toàn. Không cấp phát thêm Gemini API Key.');
  }

  const candidates = await getCandidateKeysForExecution();
  if (candidates.length === 0) {
    throw new Error(
      'Không có Gemini API Key khả dụng. Vui lòng thêm hoặc kích hoạt key trong Bảng Điều Khiển Quản Trị.'
    );
  }

  const supabase = getSupabaseAdminClient();
  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (i > 0 && options?.isStopRequested?.()) {
      throw (
        (lastError instanceof Error ? lastError : null) ||
        new Error('Đã nhận tín hiệu dừng an toàn. Không cấp phát thêm key để thử lại.')
      );
    }

    const client = getOrCreateGenAIClient(candidate.plainKey);
    const startMs = Date.now();
    inFlightKeys.add(candidate.plainKey);

    try {
      const result = await operation(client, candidate.label);
      const latencyMs = Date.now() - startMs;
      const nowIso = new Date().toISOString();

      memoryCooldownMap.delete(candidate.plainKey);

      if (supabase && candidate.id && candidate.row) {
        void supabase
          .from('gemini_api_keys')
          .update({
            status: 'healthy',
            cooldown_until: null,
            last_used_at: nowIso,
            last_latency_ms: latencyMs,
            last_error_code: null,
            last_error_message: null,
            success_count: Number(candidate.row.success_count || 0) + 1,
            updated_at: nowIso,
          })
          .eq('id', candidate.id);
      }

      return result;
    } catch (err: unknown) {
      lastError = err;

      // If stop was requested while this request was running, do not allocate any more keys
      if (options?.isStopRequested?.()) {
        throw err;
      }

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const anyErr = err as { status?: number; code?: number; message?: string };
      const errCode = anyErr.status || anyErr.code || 500;
      const errMsg = (anyErr.message || String(err)).slice(0, 300);

      if (isFatalError(err)) {
        memoryCooldownMap.set(candidate.plainKey, now + 24 * 60 * 60 * 1000);
        if (supabase && candidate.id && candidate.row) {
          void supabase
            .from('gemini_api_keys')
            .update({
              status: 'dead',
              last_used_at: nowIso,
              last_error_code: errCode,
              last_error_message: errMsg,
              error_count: Number(candidate.row.error_count || 0) + 1,
              updated_at: nowIso,
            })
            .eq('id', candidate.id);
        }
        continue;
      }

      if (isRateLimitError(err) || isTimeoutError(err)) {
        const cooldownUntilMs = now + 2 * 60 * 1000;
        memoryCooldownMap.set(candidate.plainKey, cooldownUntilMs);
        if (supabase && candidate.id && candidate.row) {
          void supabase
            .from('gemini_api_keys')
            .update({
              status: 'cooldown',
              cooldown_until: new Date(cooldownUntilMs).toISOString(),
              last_used_at: nowIso,
              last_error_code: errCode,
              last_error_message: errMsg,
              rate_limit_count: Number(candidate.row.rate_limit_count || 0) + 1,
              error_count: Number(candidate.row.error_count || 0) + 1,
              updated_at: nowIso,
            })
            .eq('id', candidate.id);
        }
        continue;
      }

      const transientCooldownMs = now + 60 * 1000;
      memoryCooldownMap.set(candidate.plainKey, transientCooldownMs);
      if (supabase && candidate.id && candidate.row) {
        void supabase
          .from('gemini_api_keys')
          .update({
            status: 'cooldown',
            cooldown_until: new Date(transientCooldownMs).toISOString(),
            last_used_at: nowIso,
            last_error_code: errCode,
            last_error_message: errMsg,
            error_count: Number(candidate.row.error_count || 0) + 1,
            updated_at: nowIso,
          })
          .eq('id', candidate.id);
      }
      continue;
    } finally {
      inFlightKeys.delete(candidate.plainKey);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Tất cả Gemini API Keys đều đang chạm giới hạn (cooldown) hoặc gặp sự cố.');
}
