import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { cn, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConversationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdminContext();
  if (!admin) return null;
  const { id } = await params;
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("organization_id", admin.organizationId)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <Link
        href="/admin/conversations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to conversations
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold">
            {conversation.session_id.slice(0, 24)}…
          </h1>
          <p className="text-sm text-muted-foreground">
            {messages?.length || 0} messages
          </p>
        </div>
        <Badge
          variant={
            conversation.status === "resolved"
              ? "success"
              : conversation.status === "handoff_requested"
                ? "warning"
                : "secondary"
          }
        >
          {conversation.status.replace("_", " ")}
        </Badge>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-5">
        {messages && messages.length > 0 ? (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted"
                )}
              >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div
                  className={cn(
                    "mt-1 text-[10px]",
                    m.role === "user"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  )}
                >
                  {formatTime(m.created_at)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            No messages recorded for this conversation.
          </p>
        )}
      </div>
    </div>
  );
}
