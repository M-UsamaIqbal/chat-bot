import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["pending", "resolved"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { id } = await params;
  const db = getAdminClient();

  // Load the handoff to also sync the parent conversation status.
  const { data: handoff } = await db
    .from("handoff_requests")
    .select("id, conversation_id, organization_id")
    .eq("id", id)
    .eq("organization_id", admin.organizationId)
    .maybeSingle();

  if (!handoff) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const resolved = parsed.data.status === "resolved";
  await db
    .from("handoff_requests")
    .update({
      status: parsed.data.status,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (handoff.conversation_id) {
    await db
      .from("conversations")
      .update({ status: resolved ? "resolved" : "handoff_requested" })
      .eq("id", handoff.conversation_id);
  }

  return NextResponse.json({ ok: true });
}
