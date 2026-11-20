import Link from "next/link";
import {
  MessagesSquare,
  Users,
  LifeBuoy,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function count(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  orgId: string,
  filter?: { col: string; val: string }
) {
  let q = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (filter) q = q.eq(filter.col, filter.val);
  const { count } = await q;
  return count || 0;
}

export default async function OverviewPage() {
  const admin = await getAdminContext();
  if (!admin) return null;
  const supabase = await createClient();
  const orgId = admin.organizationId;

  const [conversations, leads, pendingHandoffs, documents] = await Promise.all([
    count(supabase, "conversations", orgId),
    count(supabase, "leads", orgId),
    count(supabase, "handoff_requests", orgId, { col: "status", val: "pending" }),
    count(supabase, "knowledge_documents", orgId),
  ]);

  const { data: recentLeads } = await supabase
    .from("leads")
    .select("id, name, email, service_interest, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentConversations } = await supabase
    .from("conversations")
    .select("id, session_id, status, updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(5);

  const stats = [
    {
      label: "Conversations",
      value: conversations,
      icon: MessagesSquare,
      href: "/admin/conversations",
    },
    { label: "Leads", value: leads, icon: Users, href: "/admin/leads" },
    {
      label: "Pending handoffs",
      value: pendingHandoffs,
      icon: LifeBuoy,
      href: "/admin/handoffs",
    },
    {
      label: "Knowledge docs",
      value: documents,
      icon: BookOpen,
      href: "/admin/knowledge",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back. Here&apos;s what&apos;s happening with your assistant.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="text-3xl font-bold">{s.value}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {s.label}
                  </div>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent leads</CardTitle>
            <Link
              href="/admin/leads"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLeads && recentLeads.length > 0 ? (
              recentLeads.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {l.email}
                    </div>
                  </div>
                  <div className="text-right">
                    {l.service_interest && (
                      <Badge variant="secondary" className="mb-1">
                        {l.service_interest}
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {formatDate(l.created_at)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No leads yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent conversations</CardTitle>
            <Link
              href="/admin/conversations"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentConversations && recentConversations.length > 0 ? (
              recentConversations.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/conversations/${c.id}`}
                  className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0 hover:opacity-80"
                >
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {c.session_id.slice(0, 16)}…
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatDate(c.updated_at)}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No conversations yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "handoff_requested")
    return <Badge variant="warning">Handoff</Badge>;
  if (status === "resolved") return <Badge variant="success">Resolved</Badge>;
  return <Badge variant="secondary">Active</Badge>;
}
