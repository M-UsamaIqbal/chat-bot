/**
 * Rate limiter with a durable backend when configured.
 *
 * - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, limits are
 *   enforced in Upstash Redis — shared across all serverless instances and
 *   durable across cold starts (the correct behavior for Vercel).
 * - Otherwise it falls back to an in-memory sliding window, which is fine for
 *   local dev / single-instance but NOT reliable on serverless (each instance
 *   has its own store). A warning is logged once so this isn't silent.
 *
 * `rateLimit()` is async. Callers must await it.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstashConfigured = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

let warnedInMemory = false;

/** In-memory fixed/sliding window — the original implementation, used as fallback. */
function rateLimitInMemory(
  key: string,
  limit: number,
  windowMs: number
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

/**
 * Durable fixed-window limiter backed by Upstash Redis REST.
 * Atomically: create the counter with a TTL on first hit (SET NX PX), then INCR.
 * The window count is the INCR result; success while count <= limit.
 */
async function rateLimitUpstash(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`;
  const body = JSON.stringify([
    ["SET", redisKey, "0", "PX", String(windowMs), "NX"],
    ["INCR", redisKey],
    ["PTTL", redisKey],
  ]);

  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body,
    // Keep the limiter fast; if Redis is slow, fail open rather than block users.
    signal: AbortSignal.timeout(2000),
  });

  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const out = (await res.json()) as { result: unknown }[];
  const count = Number(out[1]?.result ?? 0);
  const pttl = Number(out[2]?.result ?? windowMs);
  const resetAt = Date.now() + (pttl > 0 ? pttl : windowMs);

  return {
    success: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

/**
 * Enforce a request limit for `key` within `windowMs`. Returns whether the
 * request is allowed plus remaining budget. Never throws — on backend error it
 * fails OPEN (allows the request) so a Redis blip can't take down the chat.
 */
export async function rateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000
): Promise<RateLimitResult> {
  if (upstashConfigured) {
    try {
      return await rateLimitUpstash(key, limit, windowMs);
    } catch (err) {
      console.error("rateLimit: Upstash error, failing open:", err);
      return { success: true, limit, remaining: limit - 1, resetAt: Date.now() + windowMs };
    }
  }

  if (!warnedInMemory) {
    warnedInMemory = true;
    console.warn(
      "rateLimit: using in-memory store (not durable on serverless). Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for shared, durable limits."
    );
  }
  return rateLimitInMemory(key, limit, windowMs);
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

// Periodically purge expired in-memory buckets to bound memory.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store.entries()) {
      if (bucket.resetAt < now) store.delete(key);
    }
  }, 5 * 60_000).unref?.();
}
