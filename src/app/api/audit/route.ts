import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditTracking } from "@/lib/audit";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ url: z.string().min(3).max(300) });

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`audit:${ip}`, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many audits. Please wait a moment." },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a website URL." }, { status: 400 });
  }

  const result = await auditTracking(parsed.data.url);
  return NextResponse.json(result);
}
