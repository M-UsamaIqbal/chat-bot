"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { Lead } from "@/lib/types";

const STATUSES: Lead["status"][] = ["new", "contacted", "qualified", "closed"];

export function LeadsTable({ initialLeads }: { initialLeads: Lead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [busy, setBusy] = useState<string | null>(null);

  const updateStatus = async (id: string, status: Lead["status"]) => {
    setBusy(id);
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status } : l))
    );
    try {
      await fetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } finally {
      setBusy(null);
      router.refresh();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    setBusy(id);
    try {
      await fetch(`/api/admin/leads/${id}`, { method: "DELETE" });
      setLeads((prev) => prev.filter((l) => l.id !== id));
    } finally {
      setBusy(null);
      router.refresh();
    }
  };

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
        No leads yet. They&apos;ll appear here as the assistant captures them.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Contact</th>
            <th className="px-4 py-3 font-medium">Service</th>
            <th className="px-4 py-3 font-medium">Requirements</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b last:border-0 hover:bg-muted/20">
              <td className="px-4 py-3">
                <div className="font-medium">{l.name}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" /> {l.email}
                </div>
                {l.phone && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {l.phone}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                {l.service_interest ? (
                  <Badge variant="secondary">{l.service_interest}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="max-w-xs px-4 py-3 text-muted-foreground">
                <span className="line-clamp-2">{l.requirements || "—"}</span>
              </td>
              <td className="px-4 py-3">
                <select
                  value={l.status}
                  disabled={busy === l.id}
                  onChange={(e) =>
                    updateStatus(l.id, e.target.value as Lead["status"])
                  }
                  className="rounded-md border bg-background px-2 py-1 text-xs capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                {formatDate(l.created_at)}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => remove(l.id)}
                  disabled={busy === l.id}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Delete lead"
                >
                  {busy === l.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
