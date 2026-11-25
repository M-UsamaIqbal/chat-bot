import { NextRequest, NextResponse } from "next/server";
import { leadSchema } from "@/lib/validation";
import { resolveOrg } from "@/lib/org";
import { ensureConversation } from "@/lib/conversations";
import { upsertLead } from "@/lib/leads";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { isOriginAllowed, corsHeaders } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CORS preflight for cross-origin widget embeds. */
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/**
 * Public lead-capture endpoint (used by an optional lead form in the widget).
 * Rate-limited, validated, and deduplicated by email per organization.
 */
export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);

  if (!isOriginAllowed(req)) {
    return NextResponse.json(
      { error: "Origin not allowed." },
      { status: 403, headers: cors }
    );
  }

  const ip = getClientIp(req);
  const rl = await rateLimit(`lead:${ip}`, 5, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a moment." },
      { status: 429, headers: cors }
    );
  }

  const parsed = leadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide a valid name and email.", details: parsed.error.flatten() },
      { status: 400, headers: cors }
    );
  }

  const org = await resolveOrg(parsed.data.orgSlug);
  const conversationId = parsed.data.sessionId
    ? await ensureConversation(org, parsed.data.sessionId)
    : null;

  const result = await upsertLead(
    org.org.id,
    conversationId,
    parsed.data,
    org.org.name
  );

  if (!result.ok && result.reason === "db_unconfigured") {
    return NextResponse.json(
      { error: "Lead storage isn't configured yet." },
      { status: 503, headers: cors }
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: "Could not save lead." },
      { status: 500, headers: cors }
    );
  }

  return NextResponse.json(
    { ok: true, deduped: result.deduped },
    { headers: cors }
  );
}
