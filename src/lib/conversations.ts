import { getAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/config";
import type { ResolvedOrg } from "@/lib/org";

/** Returns true when DB writes are possible. */
function dbEnabled() {
  return isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Ensures a conversation row exists for this session and returns its id.
 * No-op (returns null) in demo mode without a database.
 */
export async function ensureConversation(
  org: ResolvedOrg,
  sessionId: string
): Promise<string | null> {
  if (!dbEnabled() || org.isFallback) return null;

  const db = getAdminClient();
  const { data: existing } = await db
    .from("conversations")
    .select("id")
    .eq("organization_id", org.org.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing) {
    await db
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created, error } = await db
    .from("conversations")
    .insert({
      organization_id: org.org.id,
      session_id: sessionId,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    console.error("ensureConversation failed:", error.message);
    return null;
  }
  return created.id;
}

export async function saveMessage(
  conversationId: string | null,
  org: ResolvedOrg,
  role: "user" | "assistant",
  content: string
) {
  if (!dbEnabled() || !conversationId) return;
  try {
    const db = getAdminClient();
    await db.from("messages").insert({
      conversation_id: conversationId,
      organization_id: org.org.id,
      role,
      content,
    });
  } catch (err) {
    console.error("saveMessage failed:", err);
  }
}
