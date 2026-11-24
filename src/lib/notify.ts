/**
 * Operational notifications for new leads and human-handoff requests.
 *
 * Two optional channels, each enabled only when its env vars are present:
 *   - Slack:  SLACK_WEBHOOK_URL
 *   - Email:  RESEND_API_KEY + NOTIFY_EMAIL_TO + NOTIFY_EMAIL_FROM
 *
 * When nothing is configured these are silent no-ops (so the app keeps working
 * exactly as before). All sends are best-effort and NEVER throw — a failing
 * notification must not break lead capture or handoff.
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL_TO = process.env.NOTIFY_EMAIL_TO;
const NOTIFY_EMAIL_FROM = process.env.NOTIFY_EMAIL_FROM;

const slackEnabled = Boolean(SLACK_WEBHOOK_URL);
const emailEnabled = Boolean(RESEND_API_KEY && NOTIFY_EMAIL_TO && NOTIFY_EMAIL_FROM);

export function isNotifyConfigured(): boolean {
  return slackEnabled || emailEnabled;
}

async function postSlack(subject: string, lines: string[]): Promise<void> {
  const text = `*${subject}*\n${lines.join("\n")}`;
  await fetch(SLACK_WEBHOOK_URL as string, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(4000),
  });
}

async function sendEmail(subject: string, lines: string[]): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: NOTIFY_EMAIL_FROM,
      to: NOTIFY_EMAIL_TO,
      subject,
      text: lines.join("\n"),
    }),
    signal: AbortSignal.timeout(5000),
  });
}

/** Fan out to every configured channel. Best-effort; failures are logged, not thrown. */
async function dispatch(subject: string, lines: string[]): Promise<void> {
  if (!isNotifyConfigured()) return;
  const jobs: Promise<void>[] = [];
  if (slackEnabled) jobs.push(postSlack(subject, lines));
  if (emailEnabled) jobs.push(sendEmail(subject, lines));
  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") console.error("notify: channel failed:", r.reason);
  }
}

export interface LeadNotice {
  orgName?: string;
  name: string;
  email: string;
  phone?: string | null;
  service_interest?: string | null;
  requirements?: string | null;
}

export async function notifyNewLead(lead: LeadNotice): Promise<void> {
  try {
    const org = lead.orgName ? ` · ${lead.orgName}` : "";
    await dispatch(`🟢 New lead${org}`, [
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      lead.phone ? `Phone: ${lead.phone}` : "",
      lead.service_interest ? `Interested in: ${lead.service_interest}` : "",
      lead.requirements ? `Needs: ${lead.requirements}` : "",
    ].filter(Boolean));
  } catch (err) {
    console.error("notifyNewLead failed:", err);
  }
}

export interface HandoffNotice {
  orgName?: string;
  reason?: string | null;
  conversationId?: string | null;
}

export async function notifyHandoff(h: HandoffNotice): Promise<void> {
  try {
    const org = h.orgName ? ` · ${h.orgName}` : "";
    await dispatch(`🔔 Human handoff requested${org}`, [
      h.reason ? `Reason: ${h.reason}` : "A visitor asked to speak with a human.",
      h.conversationId ? `Conversation: ${h.conversationId}` : "",
    ].filter(Boolean));
  } catch (err) {
    console.error("notifyHandoff failed:", err);
  }
}
