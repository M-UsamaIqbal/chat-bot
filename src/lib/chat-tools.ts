import { getAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/config";
import { leadSchema } from "@/lib/validation";
import { upsertLead } from "@/lib/leads";
import { auditTracking, summarizeAudit } from "@/lib/audit";
import { notifyHandoff } from "@/lib/notify";
import type { ResolvedOrg } from "@/lib/org";

/**
 * Function-tool definitions (OpenAI Chat Completions format, also supported by
 * Groq and other compatible providers) so the model can capture leads and
 * request human handoff. These are the ONLY side-effecting actions the model can
 * trigger, and each is validated + rate-limited server-side.
 */
export function buildToolDefinitions(org: ResolvedOrg) {
  const tools: Record<string, unknown>[] = [];

  if (org.config.lead_capture_enabled) {
    tools.push({
      type: "function",
      function: {
        name: "capture_lead",
        description:
          "Save a sales lead once you have the visitor's name, email, and what they need. Call this exactly once per visitor when details are collected.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Visitor full name" },
            email: { type: "string", description: "Visitor email address" },
            phone: { type: "string", description: "Phone number (optional)" },
            service_interest: {
              type: "string",
              description:
                "Which service the visitor is interested in, if known",
            },
            requirements: {
              type: "string",
              description: "Short summary of what the visitor needs",
            },
          },
          required: ["name", "email"],
        },
      },
    });
  }

  // On-brand lead magnet: scan a visitor's site for tracking tags.
  tools.push({
    type: "function",
    function: {
      name: "audit_website_tracking",
      description:
        "Run a free ad-tracking audit on a website the visitor provides. Scans the page for analytics and ad-conversion tags (GA4, Google Tag Manager, Meta Pixel, Google Ads, TikTok, LinkedIn, etc.) and shows the visitor a visual report. Call this whenever a visitor wants to check their tracking setup or shares their website URL for review.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The visitor's website URL (e.g. example.com)",
          },
        },
        required: ["url"],
      },
    },
  });

  if (org.config.human_handoff_enabled) {
    tools.push({
      type: "function",
      function: {
        name: "request_human_handoff",
        description:
          "Flag this conversation for a human team member when the visitor asks for a human, is frustrated, or needs something you cannot resolve.",
        parameters: {
          type: "object",
          properties: {
            reason: {
              type: "string",
              description: "Short reason for the handoff",
            },
          },
          required: ["reason"],
        },
      },
    });
  }

  return tools;
}

export interface ToolExecutionContext {
  org: ResolvedOrg;
  sessionId: string;
  conversationId: string | null;
}

export interface ToolExecutionResult {
  output: string;
  action?: { type: string; payload?: Record<string, unknown> };
}

/** Executes a model-requested function tool. Never throws — returns a message. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    if (name === "capture_lead") return await captureLead(args, ctx);
    if (name === "request_human_handoff")
      return await requestHandoff(args, ctx);
    if (name === "audit_website_tracking") return await runAudit(args);
    return { output: `Unknown tool: ${name}` };
  } catch (err) {
    console.error(`Tool ${name} failed:`, err);
    return {
      output:
        "There was a problem saving that just now, but I've noted it. A team member can still follow up.",
    };
  }
}

async function captureLead(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const parsed = leadSchema.safeParse({
    name: args.name,
    email: args.email,
    phone: args.phone ?? null,
    service_interest: args.service_interest ?? null,
    requirements: args.requirements ?? null,
  });

  if (!parsed.success) {
    return {
      output:
        "I still need a valid name and email before I can pass this to our team. Could you share those?",
    };
  }

  const lead = parsed.data;

  const result = await upsertLead(
    ctx.org.org.id,
    ctx.conversationId,
    lead,
    ctx.org.org.name
  );

  if (!result.ok && result.reason === "db_unconfigured") {
    return {
      output:
        "Captured the visitor's details (database not configured in this environment).",
      action: { type: "lead_capture", payload: { email: lead.email } },
    };
  }

  if (!result.ok) {
    return {
      output:
        "I noted the visitor's details but couldn't save them just now. A team member can still follow up.",
    };
  }

  return {
    output: result.deduped
      ? "Lead already on file — details updated. Confirm the team will follow up."
      : "Lead saved successfully. Confirm to the visitor that the team will reach out.",
    action: {
      type: "lead_capture",
      payload: { email: lead.email, deduped: result.deduped },
    },
  };
}

async function runAudit(
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  // Guard against the model running the audit with a missing/placeholder URL.
  const looksReal = /\.[a-z]{2,}/i.test(url) && !/^(your|example|mywebsite|site|website|domain)\b/i.test(url);
  if (!url || !looksReal) {
    return {
      output:
        "No valid website URL was provided. Do NOT report any results. Instead, ask the visitor: 'What's your website URL?' and wait for their answer before running the audit.",
    };
  }
  const result = await auditTracking(url);
  return {
    output: summarizeAudit(result),
    // Forwarded to the client so it can render the visual audit card.
    action: { type: "audit", payload: { result } },
  };
}

async function requestHandoff(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const reason =
    typeof args.reason === "string" ? args.reason.slice(0, 1000) : null;

  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      output:
        "Handoff noted (database not configured). Tell the visitor a human will follow up.",
      action: { type: "human_handoff" },
    };
  }

  const db = getAdminClient();

  if (ctx.conversationId) {
    // Avoid duplicate pending handoffs for the same conversation.
    const { data: existing } = await db
      .from("handoff_requests")
      .select("id")
      .eq("conversation_id", ctx.conversationId)
      .eq("status", "pending")
      .maybeSingle();

    if (!existing) {
      await db.from("handoff_requests").insert({
        organization_id: ctx.org.org.id,
        conversation_id: ctx.conversationId,
        reason,
        status: "pending",
      });
      // Alert the team — only for a newly-created pending handoff.
      await notifyHandoff({
        orgName: ctx.org.org.name,
        reason,
        conversationId: ctx.conversationId,
      });
    }

    await db
      .from("conversations")
      .update({ status: "handoff_requested" })
      .eq("id", ctx.conversationId);
  }

  return {
    output:
      "Handoff request created. Reassure the visitor that a team member will follow up soon, and collect their email if you don't have it.",
    action: { type: "human_handoff" },
  };
}
