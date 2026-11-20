import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/auth";
import { deleteDocument } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await deleteDocument(admin.organizationId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete document failed:", err);
    return NextResponse.json(
      { error: "Failed to delete document." },
      { status: 500 }
    );
  }
}
