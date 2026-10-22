import 'server-only';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

const ipStore = new Map<string, RateLimitRecord>();

// Cleanup stale records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipStore.entries()) {
    if (now > record.resetTime) {
      ipStore.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

export function checkRateLimit(ip: string): { success: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = ipStore.get(ip);

  if (!record || now > record.resetTime) {
    ipStore.set(ip, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });
    return { success: true };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { success: false, retryAfter };
  }

  record.count += 1;
  return { success: true };
}
