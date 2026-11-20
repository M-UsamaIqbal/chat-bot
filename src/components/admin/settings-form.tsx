"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  Plus,
  X,
  Copy,
  Check,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrgChatbotConfig } from "@/lib/types";

export function SettingsForm({
  config,
  appUrl,
  orgSlug,
}: {
  config: OrgChatbotConfig;
  appUrl: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const [botName, setBotName] = useState(config.bot_name);
  const [welcome, setWelcome] = useState(config.welcome_message);
  const [color, setColor] = useState(config.primary_color || "#5A24BA");
  const [bookingUrl, setBookingUrl] = useState(config.booking_url || "");
  const [handoff, setHandoff] = useState(config.human_handoff_enabled);
  const [leadCapture, setLeadCapture] = useState(config.lead_capture_enabled);
  const [questions, setQuestions] = useState<string[]>(
    config.suggested_questions?.length ? config.suggested_questions : [""]
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const embedSnippet = `<script src="${appUrl}/embed/widget.js" data-org="${orgSlug}" data-color="${color}" async></script>`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_name: botName,
          welcome_message: welcome,
          suggested_questions: questions.map((q) => q.trim()).filter(Boolean),
          primary_color: color,
          booking_url: bookingUrl.trim(),
          human_handoff_enabled: handoff,
          lead_capture_enabled: leadCapture,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setMsg({ ok: true, text: "Settings saved." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const copyEmbed = async () => {
    await navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance & messaging</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bot-name">Assistant name</Label>
              <Input
                id="bot-name"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Primary color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-md border"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="welcome">Welcome message</Label>
            <Textarea
              id="welcome"
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              rows={3}
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suggested questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={q}
                onChange={(e) =>
                  setQuestions((prev) =>
                    prev.map((item, idx) => (idx === i ? e.target.value : item))
                  )
                }
                placeholder="e.g. What services do you offer?"
              />
              <button
                type="button"
                onClick={() =>
                  setQuestions((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="rounded-md p-2 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {questions.length < 8 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuestions((prev) => [...prev, ""])}
            >
              <Plus className="h-4 w-4" /> Add question
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" /> Booking & behavior
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="booking">Consultation booking URL</Label>
            <Input
              id="booking"
              type="url"
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              placeholder="https://calendly.com/your-company/consult"
            />
            <p className="text-xs text-muted-foreground">
              The assistant shares this link when a visitor wants to book — it
              never claims an appointment is confirmed.
            </p>
          </div>

          <Toggle
            label="Human handoff"
            description="Let visitors request a human; unresolved chats appear under Handoffs."
            checked={handoff}
            onChange={setHandoff}
          />
          <Toggle
            label="Lead capture"
            description="Allow the assistant to collect name, email, and requirements."
            checked={leadCapture}
            onChange={setLeadCapture}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Embed on your website</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste this snippet before the closing{" "}
            <code className="rounded bg-muted px-1">&lt;/body&gt;</code> tag on
            any site to add the floating assistant.
          </p>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-12 text-xs">
              <code>{embedSnippet}</code>
            </pre>
            <button
              type="button"
              onClick={copyEmbed}
              className="absolute right-2 top-2 rounded-md bg-background p-1.5 shadow-sm hover:bg-accent"
              title="Copy"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border bg-card/95 p-4 shadow-sm backdrop-blur">
        {msg ? (
          <p
            className={`text-sm ${
              msg.ok ? "text-green-700" : "text-destructive"
            }`}
          >
            {msg.text}
          </p>
        ) : (
          <span className="text-sm text-muted-foreground">
            Changes apply to the live widget immediately after saving.
          </span>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Save settings
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
