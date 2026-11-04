import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'admin123';
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || `${getAdminPassword()}_secret_salt`;
}

/**
 * Verify administrator plaintext password using constant-time comparison
 */
export function verifyAdminPassword(password: string): boolean {
  if (!password || typeof password !== 'string') {
    return false;
  }

  const expected = getAdminPassword();
  const bufA = Buffer.from(password);
  const bufB = Buffer.from(expected);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Creates an HMAC-SHA256 signed session token containing timestamp
 */
function createSessionToken(): string {
  const secret = getSessionSecret();
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`admin:${timestamp}`)
    .digest('hex');

  return `${timestamp}.${signature}`;
}

/**
 * Verifies that a session token is genuine and within the valid expiration window
 */
function verifySessionToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const secret = getSessionSecret();

  // Support timestamp.signature format
  const parts = token.split('.');
  if (parts.length === 2) {
    const [timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return false;
    }

    const ageSeconds = (Date.now() - timestamp) / 1000;
    // Allow slight clock drift (up to 60s in future) and reject expired tokens
    if (ageSeconds < -60 || ageSeconds > SESSION_MAX_AGE) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`admin:${timestampStr}`)
      .digest('hex');

    const bufA = Buffer.from(signature);
    const bufB = Buffer.from(expectedSignature);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }

  // Fallback for static token format
  const expectedStatic = crypto
    .createHmac('sha256', secret)
    .update('admin_session')
    .digest('hex');

  const bufToken = Buffer.from(token);
  const bufExpected = Buffer.from(expectedStatic);

  if (bufToken.length !== bufExpected.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufToken, bufExpected);
}

/**
 * Sets the admin session cookie on the current request context
 */
export async function setAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const token = createSessionToken();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Clears the admin session cookie
 */
export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  try {
    cookieStore.delete(COOKIE_NAME);
  } catch {
    // Some contexts might prefer explicit cookie expiration
  }

  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Verifies whether the current request holds a valid admin session cookie
 */
export async function verifyAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) {
      return false;
    }

    return verifySessionToken(token);
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    return false;
  }
}
