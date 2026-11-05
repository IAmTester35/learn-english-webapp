import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const DEFAULT_ADMIN_EMAIL =
  (process.env.ADMIN_EMAIL || 'admin@ltestlab.local').trim();

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
      error: 'Không thể khởi tạo kết nối Supabase Auth.',
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

  return {
    success: true,
    email: data.user.email,
  };
}

/**
 * Signs out the current Supabase Auth session and clears SSR cookies.
 */
export async function clearAdminSessionCookie(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = await getSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}

/**
 * Verifies whether the current request holds a valid authenticated Supabase session.
 * Because the system enforces a single Admin account on Supabase Auth (with no public user auth),
 * a verified user from `supabase.auth.getUser()` is the Admin.
 */
export async function verifyAdminSession(): Promise<boolean> {
  try {
    if (!isSupabaseConfigured()) {
      return false;
    }

    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      return false;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return false;
    }

    return true;
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    return false;
  }
}

/**
 * Returns the currently authenticated admin user's email, if any.
 */
export async function getAdminUserEmail(): Promise<string | null> {
  try {
    if (!isSupabaseConfigured()) return null;
    const supabase = await getSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.email || null;
  } catch {
    return null;
  }
}
