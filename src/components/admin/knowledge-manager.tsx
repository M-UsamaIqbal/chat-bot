"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Globe,
  HelpCircle,
  Type,
  Upload,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { KnowledgeDocument } from "@/lib/types";

type Tab = "text" | "faq" | "url" | "file";

const SOURCE_ICON: Record<string, typeof FileText> = {
  file: FileText,
  url: Globe,
  faq: HelpCircle,
  text: Type,
};

export function KnowledgeManager({
  initial,
  openaiReady,
}: {
  initial: KnowledgeDocument[];
  openaiReady: boolean;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(initial);
  const [tab, setTab] = useState<Tab>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setContent("");
    setUrl("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const refresh = () => router.refresh();

  const submitTextual = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          title,
          content: tab === "url" ? undefined : content,
          url: tab === "url" ? url : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add content.");
      setMessage({ ok: true, text: "Added and indexed successfully." });
      reset();
      refresh();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const submitFile = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage({ ok: false, text: "Choose a file first." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title || file.name);
      const res = await fetch("/api/admin/knowledge/file", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed.");
      setMessage({ ok: true, text: "File uploaded and indexed." });
      reset();
      refresh();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "file") submitFile();
    else submitTextual();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this document from the knowledge base?")) return;
    setDocs((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/admin/knowledge/${id}`, { method: "DELETE" });
    refresh();
  };

  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: "text", label: "Text / Service", icon: Type },
    { key: "faq", label: "FAQ", icon: HelpCircle },
    { key: "url", label: "Website URL", icon: Globe },
    { key: "file", label: "Upload File", icon: Upload },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Add form */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Add knowledge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!openaiReady && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Add <code>OPENAI_API_KEY</code> to enable indexing. The AI uses
              this content to answer accurately.
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setMessage(null);
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "border-primary bg-secondary text-primary"
                    : "hover:bg-accent"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="k-title">Title</Label>
              <Input
                id="k-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  tab === "faq"
                    ? "e.g. Refund policy"
                    : tab === "url"
                      ? "e.g. Services page"
                      : "Short label for this content"
                }
                required={tab !== "file"}
              />
            </div>

            {tab === "url" ? (
              <div className="space-y-1.5">
                <Label htmlFor="k-url">URL</Label>
                <Input
                  id="k-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-company.com/services"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  We fetch the page and index its readable text.
                </p>
              </div>
            ) : tab === "file" ? (
              <div className="space-y-1.5">
                <Label htmlFor="k-file">File</Label>
                <input
                  id="k-file"
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.csv,.json,.html,.htm"
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-secondary/80"
                />
                <p className="text-xs text-muted-foreground">
                  TXT, MD, CSV, JSON, HTML · up to 5 MB. For PDF/DOCX, paste the
                  text using the “Text” tab.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="k-content">
                  {tab === "faq" ? "Question & answer" : "Content"}
                </Label>
                <Textarea
                  id="k-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  placeholder={
                    tab === "faq"
                      ? "Q: Do you offer refunds?\nA: Yes, within 30 days…"
                      : "Describe a service, policy, or any verified company information…"
                  }
                  required
                />
              </div>
            )}

            {message && (
              <p
                className={`flex items-center gap-1.5 text-sm ${
                  message.ok ? "text-green-700" : "text-destructive"
                }`}
              >
                {message.ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {message.text}
              </p>
            )}

            <Button type="submit" disabled={submitting || !openaiReady} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Indexing…
                </>
              ) : (
                "Add to knowledge base"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Document list */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">
            Indexed content ({docs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No knowledge yet. Add FAQs, service descriptions, URLs, or files so
              the assistant can answer accurately.
            </p>
          ) : (
            <div className="divide-y">
              {docs.map((d) => {
                const Icon = SOURCE_ICON[d.source_type] || FileText;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {d.title}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{d.source_type}</span>·
                          <span>{formatDate(d.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill status={d.status} />
                      <button
                        onClick={() => remove(d.id)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "indexed")
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Indexed
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="warning" className="gap-1">
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
}
