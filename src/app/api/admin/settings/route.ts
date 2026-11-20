import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  bot_name: z.string().min(1).max(100),
  welcome_message: z.string().min(1).max(1000),
  suggested_questions: z.array(z.string().max(200)).max(8),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #5A24BA"),
  booking_url: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .nullable(),
  human_handoff_enabled: z.boolean(),
  lead_capture_enabled: z.boolean(),
});

export async function PUT(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const db = getAdminClient();
  const { error } = await db
    .from("chatbot_config")
    .update({
      bot_name: data.bot_name,
      welcome_message: data.welcome_message,
      suggested_questions: data.suggested_questions.filter((q) => q.trim()),
      primary_color: data.primary_color,
      booking_url: data.booking_url ? data.booking_url : null,
      human_handoff_enabled: data.human_handoff_enabled,
      lead_capture_enabled: data.lead_capture_enabled,
    })
    .eq("organization_id", admin.organizationId);

  if (error) {
    return NextResponse.json({ error: "Failed to save settings." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
