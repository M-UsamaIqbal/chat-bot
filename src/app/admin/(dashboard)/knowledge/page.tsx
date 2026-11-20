import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/auth";
import { KnowledgeManager } from "@/components/admin/knowledge-manager";
import { isOpenAIConfigured } from "@/lib/config";
import type { KnowledgeDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const admin = await getAdminContext();
  if (!admin) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("organization_id", admin.organizationId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Knowledge base</h1>
        <p className="text-sm text-muted-foreground">
          The assistant answers only from this verified content — it never
          invents pricing, policies, or services.
        </p>
      </div>
      <KnowledgeManager
        initial={(data as KnowledgeDocument[]) || []}
        openaiReady={isOpenAIConfigured()}
      />
    </div>
  );
}
