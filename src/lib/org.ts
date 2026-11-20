import { getAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, PUBLIC_CONFIG } from "@/lib/config";
import { DEFAULT_SUGGESTED_QUESTIONS, DEFAULT_WELCOME } from "@/lib/prompts";
import type { OrgChatbotConfig, Organization } from "@/lib/types";

export interface ResolvedOrg {
  org: Organization;
  config: OrgChatbotConfig;
  /** True when served from built-in defaults because Supabase isn't configured. */
  isFallback: boolean;
}

/** Hard-coded default used when the database isn't configured yet (demo mode). */
function fallbackOrg(slug: string): ResolvedOrg {
  const orgId = "00000000-0000-0000-0000-000000000000";
  return {
    isFallback: true,
    org: {
      id: orgId,
      slug,
      name: "Your Company",
      created_at: new Date(0).toISOString(),
    },
    config: {
      id: orgId,
      organization_id: orgId,
      bot_name: "AI Support Assistant",
      welcome_message: DEFAULT_WELCOME,
      suggested_questions: DEFAULT_SUGGESTED_QUESTIONS,
      primary_color: "#5A24BA",
      booking_url: null,
      human_handoff_enabled: true,
      lead_capture_enabled: true,
      vector_store_id: null,
    },
  };
}

/**
 * Resolves an organization and its chatbot configuration by slug.
 * Falls back to built-in defaults when Supabase isn't configured so the widget
 * and demo remain functional before the database is wired up.
 */
export async function resolveOrg(slug?: string): Promise<ResolvedOrg> {
  const orgSlug = slug || PUBLIC_CONFIG.defaultOrgSlug;

  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fallbackOrg(orgSlug);
  }

  try {
    const db = getAdminClient();
    const { data: org, error } = await db
      .from("organizations")
      .select("*")
      .eq("slug", orgSlug)
      .single();

    if (error || !org) return fallbackOrg(orgSlug);

    const { data: config } = await db
      .from("chatbot_config")
      .select("*")
      .eq("organization_id", org.id)
      .single();

    const fb = fallbackOrg(orgSlug).config;
    return {
      isFallback: false,
      org: org as Organization,
      config: {
        ...fb,
        ...(config || {}),
        organization_id: org.id,
        suggested_questions:
          config?.suggested_questions?.length
            ? config.suggested_questions
            : fb.suggested_questions,
      } as OrgChatbotConfig,
    };
  } catch {
    return fallbackOrg(orgSlug);
  }
}
