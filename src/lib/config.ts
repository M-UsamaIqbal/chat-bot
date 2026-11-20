/**
 * Centralized runtime configuration.
 * Server-only secrets are read lazily so that importing this module from a
 * client component never leaks them (they resolve to undefined on the client).
 */

export const APP_NAME = "AI Support Assistant";
export const BRAND_COLOR = "#5A24BA";

export const PUBLIC_CONFIG = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  defaultOrgSlug: process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || "support",
};

/** Throws if a required server env var is missing — call inside route handlers. */
export function requireServerEnv() {
  const aiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!aiKey) missing.push("AI_API_KEY");
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    aiKey: aiKey || "",
    supabaseUrl: supabaseUrl || "",
    serviceKey: serviceKey || "",
    missing,
    ok: missing.length === 0,
  };
}

/** Whether Supabase is configured. When false the app runs in degraded/demo mode. */
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Whether a chat AI provider (Groq, OpenAI, or any compatible) is configured. */
export function isAIConfigured() {
  return Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
}

/** Backwards-compatible alias. */
export const isOpenAIConfigured = isAIConfigured;
