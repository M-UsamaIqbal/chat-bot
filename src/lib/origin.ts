/**
 * Origin allow-listing + CORS for the public widget APIs (chat, leads, audit).
 *
 * OPT-IN: set WIDGET_ALLOWED_ORIGINS to a comma-separated list of origins that
 * are permitted to call the public endpoints and embed the widget, e.g.
 *   WIDGET_ALLOWED_ORIGINS=https://wetrackads.com,https://www.wetrackads.com
 *
 * When it is UNSET the APIs behave exactly as before (open, CORS "*") so the
 * current deployment is unaffected until you choose to lock it down. The app's
 * own origin (NEXT_PUBLIC_APP_URL) is always allowed, because the widget iframe
 * is served from it and its fetches carry that origin.
 *
 * Env is read lazily (per call) so it works on serverless and is testable.
 */

function parseList(v?: string): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function normalizeOrigin(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return value.trim().replace(/\/+$/, "") || null;
  }
}

/** True when WIDGET_ALLOWED_ORIGINS is configured (restriction is active). */
export function originRestrictionEnabled(): boolean {
  return parseList(process.env.WIDGET_ALLOWED_ORIGINS).length > 0;
}

/** Configured origins plus the app's own origin (the iframe host). */
export function allowedOrigins(): string[] {
  const set = new Set(parseList(process.env.WIDGET_ALLOWED_ORIGINS));
  const app = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (app) set.add(app);
  return [...set];
}

/** The request's origin, from the Origin header, falling back to Referer. */
export function requestOrigin(req: Request): string | null {
  const o = req.headers.get("origin");
  if (o) return normalizeOrigin(o);
  const r = req.headers.get("referer");
  if (r) {
    try {
      return new URL(r).origin;
    } catch {
      /* ignore malformed referer */
    }
  }
  return null;
}

/**
 * Whether a request may call the public APIs. Allows everything when the
 * allow-list is not configured; otherwise requires a matching, known origin.
 */
export function isOriginAllowed(req: Request): boolean {
  if (!originRestrictionEnabled()) return true;
  const origin = requestOrigin(req);
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

/**
 * CORS headers for a response. Reflects the request origin when allowed (or "*"
 * when restriction is off). Always sets Vary: Origin for correct caching.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (!originRestrictionEnabled()) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }
  const origin = requestOrigin(req);
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
