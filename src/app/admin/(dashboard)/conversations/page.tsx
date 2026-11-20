import Link from "next/link";
import { MessagesSquare, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  if (status === "handoff_requested")
    return <Badge variant="warning">Handoff requested</Badge>;
  if (status === "resolved") return <Badge variant="success">Resolved</Badge>;
  return <Badge variant="secondary">Active</Badge>;
}

export default async function ConversationsPage() {
  const admin = await getAdminContext();
  if (!admin) return null;
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, session_id, status, created_at, updated_at")
    .eq("organization_id", admin.organizationId)
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="text-sm text-muted-foreground">
          Every visitor chat with the assistant.
        </p>
      </div>

      {conversations && conversations.length > 0 ? (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/admin/conversations/${c.id}`}
              className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-primary">
                  <MessagesSquare className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-mono text-sm">
                    {c.session_id.slice(0, 20)}…
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Started {formatDate(c.created_at)} · Last activity{" "}
                    {formatTime(c.updated_at)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={c.status} />
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          No conversations yet.
        </div>
      )}
    </div>
  );
}
