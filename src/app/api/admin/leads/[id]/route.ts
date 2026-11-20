import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["new", "contacted", "qualified", "closed"]),
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
  const { error } = await db
    .from("leads")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .eq("organization_id", admin.organizationId);

  if (error) {
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getAdminClient();
  await db
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("organization_id", admin.organizationId);
  return NextResponse.json({ ok: true });
}
