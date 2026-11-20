import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/auth";
import { LeadsTable } from "@/components/admin/leads-table";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const admin = await getAdminContext();
  if (!admin) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("organization_id", admin.organizationId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Contacts captured by the assistant, deduplicated by email.
        </p>
      </div>
      <LeadsTable initialLeads={(data as Lead[]) || []} />
    </div>
  );
}
