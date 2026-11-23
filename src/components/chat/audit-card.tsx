import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Gauge,
  ExternalLink,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { AuditResult } from "@/lib/types";

/** Visual report card for a website tracking audit, shown inline in the chat. */
export function AuditCard({
  audit,
  bookingUrl,
  primaryColor = "#5A24BA",
}: {
  audit: AuditResult;
  bookingUrl?: string | null;
  primaryColor?: string;
}) {
  if (!audit.ok) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        {audit.error || "The audit couldn't be completed."}
      </div>
    );
  }

  const host = (() => {
    try {
      return new URL(audit.finalUrl).hostname.replace(/^www\./, "");
    } catch {
      return audit.finalUrl;
    }
  })();

  const present = audit.trackers.filter((t) => t.found);
  const missing = audit.trackers.filter((t) => !t.found);
  // Prefer the weighted attribution-readiness grade; fall back to tag coverage.
  const pct =
    typeof audit.grade === "number"
      ? audit.grade
      : Math.round((audit.coreFound / Math.max(1, audit.coreTotal)) * 100);
  const scoreColor =
    pct >= 75 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626";
  const insights = audit.insights ?? [];

  return (
    <div className="w-full overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm font-semibold">Tracking Audit</span>
        </div>
        <span className="max-w-[55%] truncate text-xs text-white/80">{host}</span>
      </div>

      {/* Score */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
          <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={scoreColor}
              strokeWidth="3"
              strokeDasharray={`${pct} 100`}
              strokeLinecap="round"
              pathLength={100}
            />
          </svg>
          {typeof audit.grade === "number" ? (
            <span
              className="absolute text-sm font-bold"
              style={{ color: scoreColor }}
            >
              {audit.grade}
            </span>
          ) : (
            <Gauge className="absolute h-5 w-5" style={{ color: scoreColor }} />
          )}
        </div>
        <div className="text-sm">
          <div className="font-semibold">
            {typeof audit.grade === "number"
              ? "Attribution-readiness score"
              : `${audit.coreFound} of ${audit.coreTotal} key tags found`}
          </div>
          <div className="text-xs text-muted-foreground">
            {audit.coreFound} of {audit.coreTotal} key tags · GA4 · Google Ads · Meta
            {audit.viaGtm ? " · reading GTM container" : ""}
          </div>
        </div>
      </div>

      {/* Tracker list */}
      <div className="space-y-1.5 px-4 py-3">
        {present.map((t) => (
          <div key={t.key} className="flex items-start gap-2 text-xs">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <div className="min-w-0">
              <span className="font-medium">{t.name}</span>
              {t.viaGtm && (
                <span className="ml-1 rounded bg-secondary px-1 text-[9px] font-medium text-primary">
                  via GTM
                </span>
              )}
              {t.ids.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {t.ids.map((id) => (
                    <span
                      key={id}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                    >
                      {id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {missing.length > 0 && (
          <div className="pt-1">
            <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
              Not detected
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {missing.map((t) => (
                <span
                  key={t.key}
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* What this means for you — prescriptive, impact-focused findings */}
      {insights.length > 0 && (
        <div className="space-y-2 border-t px-4 py-3">
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">
            What this means for you
          </div>
          {insights.map((ins, i) => {
            const Icon =
              ins.severity === "good"
                ? CheckCircle2
                : ins.severity === "critical"
                ? AlertTriangle
                : Info;
            const color =
              ins.severity === "good"
                ? "text-green-600"
                : ins.severity === "critical"
                ? "text-red-600"
                : "text-amber-600";
            return (
              <div key={i} className="flex items-start gap-2">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                <div className="min-w-0 text-xs">
                  <div className="font-semibold">{ins.title}</div>
                  <div className="text-muted-foreground">{ins.impact}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CTA */}
      {bookingUrl && (
        <div className="border-t px-4 py-3">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            {missing.length > 0
              ? "Book a free call to fix the gaps"
              : "Book a free strategy call"}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
