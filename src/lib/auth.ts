import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

export interface AdminContext {
  userId: string;
  email: string | null;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: string;
}

/**
 * Resolves the authenticated admin and their organization using the RLS-scoped
 * server client. Returns null when unauthenticated or not a member of any org.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, organization_id, organizations(slug, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  // Supabase returns the joined relation as an object or array depending on config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgRel: any = membership.organizations;
  const org = Array.isArray(orgRel) ? orgRel[0] : orgRel;

  return {
    userId: user.id,
    email: user.email ?? null,
    organizationId: membership.organization_id,
    organizationSlug: org?.slug ?? "support",
    organizationName: org?.name ?? "Your Company",
    role: membership.role,
  };
}
