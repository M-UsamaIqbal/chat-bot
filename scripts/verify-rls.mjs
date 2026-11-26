/**
 * Live cross-tenant RLS verification.
 *
 * Proves that Row Level Security actually isolates tenants: a user who belongs
 * to Tenant B cannot read or write Tenant A's rows, and an anonymous client
 * sees nothing. Uses the PUBLIC anon key + a real signed-in session so RLS is
 * enforced (the service-role key bypasses RLS and is only used here for
 * setup/teardown).
 *
 * Creates a throwaway tenant + user, runs the checks, then deletes everything.
 * Safe to re-run (idempotent cleanup at start and end).
 *
 * Usage: node scripts/verify-rls.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(p = ".env.local") {
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPPORT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || "support";

const TEST_SLUG = "rls-test-tenant";
const TEST_EMAIL = "rls-test-user@example.com";
const TEST_PASSWORD = "Rls-Test-" + Math.random().toString(36).slice(2) + "A9!";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0,
  fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

async function findTestUserId() {
  // No getByEmail in the admin API — page through users to find ours.
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users?.find((x) => x.email === TEST_EMAIL);
    if (u) return u.id;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

async function cleanup() {
  // Remove any lead the write-test may have leaked into the support org.
  await admin
    .from("leads")
    .delete()
    .eq("email", "rls-inject@example.com");
  // Delete the test tenant (cascades members + its leads + config).
  await admin.from("organizations").delete().eq("slug", TEST_SLUG);
  // Delete the test auth user.
  const uid = await findTestUserId();
  if (uid) await admin.auth.admin.deleteUser(uid);
}

async function main() {
  // Clean any leftovers from a prior run first.
  await cleanup();

  // --- Resolve the real (victim) tenant -----------------------------------
  const { data: support } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", SUPPORT_SLUG)
    .single();
  if (!support) throw new Error(`"${SUPPORT_SLUG}" org not found`);
  const SUPPORT_ID = support.id;

  // Sanity: the service role (RLS bypass) CAN see support data, so any 0 the
  // RLS-scoped user gets below is due to RLS, not empty tables.
  const { count: supportKbCount } = await admin
    .from("knowledge_documents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", SUPPORT_ID);
  check(`service role sees support knowledge docs (${supportKbCount})`, (supportKbCount || 0) > 0);

  // --- Set up throwaway Tenant B + its user -------------------------------
  const { data: orgB, error: orgErr } = await admin
    .from("organizations")
    .insert({ slug: TEST_SLUG, name: "RLS Test Tenant" })
    .select("id")
    .single();
  if (orgErr) throw new Error("create test org: " + orgErr.message);

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (userErr) throw new Error("create test user: " + userErr.message);
  const userId = created.user.id;

  await admin
    .from("organization_members")
    .insert({ organization_id: orgB.id, user_id: userId, role: "owner" });

  await admin.from("leads").insert({
    organization_id: orgB.id,
    name: "OrgB Own Lead",
    email: "orgb-own-lead@example.com",
    status: "new",
  });

  // --- Sign in as the Tenant B user (RLS now applies) ---------------------
  const userClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signErr } = await userClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signErr) throw new Error("sign in failed: " + signErr.message);

  // 1) Can read its OWN tenant's data.
  const own = await userClient.from("leads").select("*").eq("organization_id", orgB.id);
  check("Tenant B user reads its OWN leads (>=1)", !own.error && (own.data?.length || 0) >= 1);

  // 2) CANNOT read Tenant A (support) data — RLS returns 0 rows.
  const crossLeads = await userClient.from("leads").select("*").eq("organization_id", SUPPORT_ID);
  check("Tenant B user reads support LEADS -> 0 rows", !crossLeads.error && (crossLeads.data?.length || 0) === 0);

  const crossKb = await userClient.from("knowledge_documents").select("id").eq("organization_id", SUPPORT_ID);
  check("Tenant B user reads support KNOWLEDGE -> 0 rows", !crossKb.error && (crossKb.data?.length || 0) === 0);

  const crossConv = await userClient.from("conversations").select("id").eq("organization_id", SUPPORT_ID);
  check("Tenant B user reads support CONVERSATIONS -> 0 rows", !crossConv.error && (crossConv.data?.length || 0) === 0);

  const crossOrg = await userClient.from("organizations").select("id").eq("id", SUPPORT_ID);
  check("Tenant B user reads support ORG row -> 0 rows", !crossOrg.error && (crossOrg.data?.length || 0) === 0);

  // 3) CANNOT write into Tenant A — RLS WITH CHECK must reject the insert.
  const inject = await userClient
    .from("leads")
    .insert({ organization_id: SUPPORT_ID, name: "RLS INJECT", email: "rls-inject@example.com", status: "new" })
    .select("id");
  check("Tenant B user INSERT into support -> rejected by RLS", !!inject.error && (inject.data?.length || 0) === 0);

  // 4) Anonymous (no session) sees nothing.
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const anonLeads = await anonClient.from("leads").select("id").eq("organization_id", SUPPORT_ID);
  check("Anonymous client reads support leads -> 0 rows", !anonLeads.error && (anonLeads.data?.length || 0) === 0);
}

main()
  .then(cleanup)
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("\nVerification error:", err.message);
    await cleanup().catch(() => {});
    process.exit(1);
  });
