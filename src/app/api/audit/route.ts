import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditTracking } from "@/lib/audit";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { isOriginAllowed, corsHeaders } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Serverless Chromium cold-start + page load needs more than the default 10s.
export const maxDuration = 60;

const schema = z.object({ url: z.string().min(3).max(300) });

/** CORS preflight for cross-origin widget embeds. */
export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req);

  if (!isOriginAllowed(req)) {
    return NextResponse.json(
      { error: "Origin not allowed." },
      { status: 403, headers: cors }
    );
  }

  const ip = getClientIp(req);
  const rl = await rateLimit(`audit:${ip}`, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many audits. Please wait a moment." },
      { status: 429, headers: cors }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide a website URL." },
      { status: 400, headers: cors }
    );
  }

  const result = await auditTracking(parsed.data.url);
  return NextResponse.json(result, { headers: cors });
}
