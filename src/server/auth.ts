import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const DEFAULT_ADMIN_EMAIL =
  (process.env.ADMIN_EMAIL || 'admin@ltestlab.local').trim();

interface CachedSession {
  isValid: boolean;
  email?: string;
  expiresAt: number;
}

// In-memory short-lived session cache to eliminate redundant GET /auth/v1/user network storms
const sessionCache = new Map<string, CachedSession>();

/**
 * Extracts a signature of Supabase Auth cookies from the current request.
 * If no Supabase auth token cookies are present, returns null (meaning definitely unauthenticated).
 */
async function getAuthCookieSignature(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const all = cookieStore.getAll();
    const authTokens = all
      .filter((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
      .map((c) => `${c.name}=${c.value}`)
      .sort()
      .join(';');
    return authTokens || null;
  } catch {
    return null;
  }
}

/**
 * Ensures the single Admin account exists in Supabase Auth if `ADMIN_PASSWORD` is configured
 * and `auth.users` is currently empty.
 */
export async function ensureSingleAdminProvisioned(
  targetEmail?: string
): Promise<void> {
  const adminClient = getSupabaseAdminClient();
  const envPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (!adminClient || !envPassword) return;

  try {
    const { data: listData, error: listErr } =
      await adminClient.auth.admin.listUsers({ page: 1, perPage: 2 });
    if (listErr) return;

    if (!listData?.users || listData.users.length === 0) {
      const emailToCreate = (targetEmail || DEFAULT_ADMIN_EMAIL).trim();
      await adminClient.auth.admin.createUser({
        email: emailToCreate,
        password: envPassword,
        email_confirm: true,
        user_metadata: {
          is_single_admin: true,
        },
      });
    }
  } catch {
    // Ignore bootstrap errors if service role key is not set
  }
}

/**
 * Signs in the single Admin account via Supabase Auth SSR.
 * No roles or public user authentication exist in the system.
 */
export async function signInAdminWithSupabase(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; email?: string }> {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error:
        'Chưa cấu hình NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      error: 'Không thể khởi tạo kết nối.',
    };
  }

  const cleanEmail = (email || DEFAULT_ADMIN_EMAIL).trim();
  await ensureSingleAdminProvisioned(cleanEmail);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (error || !data.user) {
    return {
      success: false,
      error:
        error?.message === 'Invalid login credentials'
          ? 'Email hoặc mật khẩu quản trị không chính xác.'
          : error?.message || 'Email hoặc mật khẩu quản trị không chính xác.',
    };
  }

  // Invalidate any old session cache
  sessionCache.clear();

  return {
    success: true,
    email: data.user.email,
  };
}

/**
 * Signs out the current Supabase Auth session and clears SSR cookies.
 */
export async function clearAdminSessionCookie(): Promise<void> {
  sessionCache.clear();
  if (!isSupabaseConfigured()) return;

  const supabase = await getSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}

/**
 * Internal session verifier with 30s in-memory TTL caching and fast-path for requests without auth cookies.
 */
async function resolveAdminSessionInternal(): Promise<{ isValid: boolean; email?: string }> {
  if (!isSupabaseConfigured()) {
    return { isValid: false };
  }

  const authSig = await getAuthCookieSignature();
  // Fast-path: If the request has no Supabase auth token cookie at all, skip network call entirely.
  if (!authSig) {
    return { isValid: false };
  }

  // Check TTL cache (reduces polling / repeated API calls to Supabase Auth by 95%+)
  const cached = sessionCache.get(authSig);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return { isValid: cached.isValid, email: cached.email };
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return { isValid: false };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    sessionCache.set(authSig, { isValid: false, expiresAt: now + 5_000 });
    return { isValid: false };
  }

  const validSession = {
    isValid: true,
    email: data.user.email,
    expiresAt: now + 30_000, // Cache valid admin session for 30 seconds
  };

  if (sessionCache.size > 200) {
    sessionCache.clear();
  }
  sessionCache.set(authSig, validSession);

  return validSession;
}

/**
 * Verifies whether the current request holds a valid authenticated Supabase session.
 * Deduplicated per-request with React cache() and cross-request with 30s token cache.
 */
export const verifyAdminSession = cache(async (): Promise<boolean> => {
  try {
    const session = await resolveAdminSessionInternal();
    return session.isValid;
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    return false;
  }
});

/**
 * Returns the currently authenticated admin user's email, if any.
 */
export const getAdminUserEmail = cache(async (): Promise<string | null> => {
  try {
    const session = await resolveAdminSessionInternal();
    return session.isValid ? session.email || null : null;
  } catch {
    return null;
  }
});
