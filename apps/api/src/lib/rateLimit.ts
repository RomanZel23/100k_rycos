import { getRedis } from '../config/redis.js';

/**
 * Fixed-window rate limiter backed by Redis. Fails OPEN when Redis is unavailable
 * (availability over strictness), but logs it.
 * Returns true when the call is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const k = `rl:${key}`;
    const count = await redis.incr(k);
    if (count === 1) await redis.expire(k, windowSeconds);
    return count <= limit;
  } catch (err: any) {
    console.warn('[RateLimit] Redis unavailable, allowing request:', err?.message);
    return true;
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  try {
    await getRedis().del(`rl:${key}`);
  } catch {}
}

/** Short-lived distributed lock (SET NX PX). Returns an unlock function or null if not acquired. */
export async function acquireLock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
  try {
    const redis = getRedis();
    const token = `${process.pid}-${Date.now()}-${Math.random()}`;
    const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return async () => {
      try {
        const current = await redis.get(`lock:${key}`);
        if (current === token) await redis.del(`lock:${key}`);
      } catch {}
    };
  } catch (err: any) {
    console.warn('[Lock] Redis unavailable, proceeding without lock:', err?.message);
    return async () => {};
  }
}
