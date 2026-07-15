/*
 * Fixed-window login throttle. Counts failed attempts per key (ip|email) and
 * blocks once the budget is spent, until the window rolls over. In-memory and
 * therefore per-instance — good enough for the prototype and single-node
 * deployments; swap the Map for Redis when running multiple nodes.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

interface Bucket {
  failures: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/** Whether this key is currently blocked (does not count an attempt). */
export function isBlocked(key: string, now: number = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b) return false;
  if (now - b.windowStart >= WINDOW_MS) {
    // Window rolled over: forget the stale bucket.
    buckets.delete(key);
    return false;
  }
  return b.failures >= MAX_FAILURES;
}

/** Record a failed attempt. Returns true when the key is now blocked. */
export function recordFailure(key: string, now: number = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { failures: 1, windowStart: now });
    return false;
  }
  b.failures += 1;
  return b.failures >= MAX_FAILURES;
}

/** Clear the counter after a successful login. */
export function recordSuccess(key: string): void {
  buckets.delete(key);
}

/** Test hook: drop every bucket. */
export function resetAll(): void {
  buckets.clear();
}
