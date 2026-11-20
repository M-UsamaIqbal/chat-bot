/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Suitable for a single-instance deployment and for protecting the public chat
 * and lead endpoints from abuse. For multi-instance / serverless scale, swap
 * the Map for Upstash Redis (same interface) — noted in README.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt < now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { success: true, limit, remaining: limit - 1, resetAt };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  return {
    success: existing.count <= limit,
    limit,
    remaining,
    resetAt: existing.resetAt,
  };
}

/** Best-effort client IP from standard proxy headers. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// Periodically purge expired buckets to bound memory.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store.entries()) {
      if (bucket.resetAt < now) store.delete(key);
    }
  }, 5 * 60_000).unref?.();
}
