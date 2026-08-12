import "server-only";

// In-memory login-attempt lockout, keyed by account email. This is a single
// long-running Node process (next start, not serverless), so an in-memory
// map is sufficient — it resets on restart, which is acceptable for a
// single-tenant on-prem deployment.

type Entry = { count: number; windowStart: number; lockedUntil?: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const attempts = new Map<string, Entry>();

export function checkLoginLockout(key: string): { locked: boolean; retryAfterMs: number } {
  const entry = attempts.get(key);
  if (!entry) return { locked: false, retryAfterMs: 0 };
  const now = Date.now();
  if (entry.lockedUntil) {
    if (entry.lockedUntil > now) return { locked: true, retryAfterMs: entry.lockedUntil - now };
    attempts.delete(key);
    return { locked: false, retryAfterMs: 0 };
  }
  if (now - entry.windowStart > WINDOW_MS) {
    attempts.delete(key);
    return { locked: false, retryAfterMs: 0 };
  }
  return { locked: false, retryAfterMs: 0 };
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}
