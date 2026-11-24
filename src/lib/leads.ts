import { getAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/config";
import { notifyNewLead } from "@/lib/notify";
import type { LeadInput } from "@/lib/validation";

export type LeadUpsertResult =
  | { ok: true; deduped: boolean }
  | { ok: false; reason: "db_unconfigured" | "error" };

/**
 * Inserts a lead, deduplicating by (organization_id, email). A repeat email
 * enriches the existing lead instead of creating a duplicate. Shared by the AI
 * capture_lead tool and the public /api/leads endpoint.
 */
export async function upsertLead(
  organizationId: string,
  conversationId: string | null,
  input: LeadInput,
  orgName?: string
): Promise<LeadUpsertResult> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: "db_unconfigured" };
  }

  try {
    const db = getAdminClient();
    const email = input.email.toLowerCase();

    const { data: existing } = await db
      .from("leads")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      await db
        .from("leads")
        .update({
          name: input.name,
          phone: input.phone ?? null,
          service_interest: input.service_interest ?? null,
          requirements: input.requirements ?? null,
          conversation_id: conversationId,
        })
        .eq("id", existing.id);
      return { ok: true, deduped: true };
    }

    await db.from("leads").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      name: input.name,
      email,
      phone: input.phone ?? null,
      service_interest: input.service_interest ?? null,
      requirements: input.requirements ?? null,
      status: "new",
    });

    // Fire an ops notification for genuinely new leads (not repeat/dedup hits).
    await notifyNewLead({
      orgName,
      name: input.name,
      email,
      phone: input.phone ?? null,
      service_interest: input.service_interest ?? null,
      requirements: input.requirements ?? null,
    });
    return { ok: true, deduped: false };
  } catch (err) {
    console.error("upsertLead failed:", err);
    return { ok: false, reason: "error" };
  }
}
