"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LifeBuoy, Check, RotateCcw, Loader2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";

interface HandoffRow {
  id: string;
  conversation_id: string;
  reason: string | null;
  status: "pending" | "resolved";
  created_at: string;
}

export function HandoffsList({ initial }: { initial: HandoffRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = async (id: string, status: "pending" | "resolved") => {
    setBusy(id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await fetch(`/api/admin/handoffs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } finally {
      setBusy(null);
      router.refresh();
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
        No handoff requests. Unresolved requests from visitors will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex items-start justify-between gap-4 rounded-xl border bg-card p-5"
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                r.status === "pending"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              <LifeBuoy className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {r.status === "pending" ? (
                  <Badge variant="warning">Pending</Badge>
                ) : (
                  <Badge variant="success">Resolved</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDate(r.created_at)} · {formatTime(r.created_at)}
                </span>
              </div>
              <p className="mt-1.5 text-sm">
                {r.reason || "Visitor requested a human."}
              </p>
              <Link
                href={`/admin/conversations/${r.conversation_id}`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View conversation <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="shrink-0">
            {r.status === "pending" ? (
              <Button
                size="sm"
                disabled={busy === r.id}
                onClick={() => setStatus(r.id, "resolved")}
              >
                {busy === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Mark resolved
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy === r.id}
                onClick={() => setStatus(r.id, "pending")}
              >
                <RotateCcw className="h-4 w-4" />
                Reopen
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
