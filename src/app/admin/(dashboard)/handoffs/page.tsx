import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/auth";
import { HandoffsList } from "@/components/admin/handoffs-list";

export const dynamic = "force-dynamic";

export default async function HandoffsPage() {
  const admin = await getAdminContext();
  if (!admin) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("handoff_requests")
    .select("id, conversation_id, reason, status, created_at")
    .eq("organization_id", admin.organizationId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Human handoffs</h1>
        <p className="text-sm text-muted-foreground">
          Conversations where a visitor asked for a human. Resolve them once
          your team has followed up.
        </p>
      </div>
      <HandoffsList initial={data || []} />
    </div>
  );
}
