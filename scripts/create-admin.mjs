/**
 * Creates (or updates) an admin user and links them to the default organization.
 *
 * Usage:
 *   1. Make sure .env.local has NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      ADMIN_EMAIL, ADMIN_PASSWORD, and (optionally) NEXT_PUBLIC_DEFAULT_ORG_SLUG.
 *   2. Run the SQL in supabase/setup.sql in the Supabase SQL editor first.
 *   3. node scripts/create-admin.mjs
 *
 * Safe to run multiple times — it will reset the password and re-link membership.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- Load .env.local (no extra dependency needed) -------------------------
function loadEnv(path = ".env.local") {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    console.warn("Could not read .env.local — relying on process env.");
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const orgSlug = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || "support";

function fail(msg) {
  console.error("\n❌ " + msg + "\n");
  process.exit(1);
}

if (!url || url.includes("xxxx")) fail("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local.");
if (!serviceKey || serviceKey.includes("xxxx"))
  fail("SUPABASE_SERVICE_ROLE_KEY is not set in .env.local.");
if (!email || !password) fail("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local.");

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Ensure the organization exists (in case the seed wasn't run).
  let { data: org } = await db
    .from("organizations")
    .select("id, slug")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (!org) {
    const { data: created, error } = await db
      .from("organizations")
      .insert({ slug: orgSlug, name: "Your Company" })
      .select("id, slug")
      .single();
    if (error) fail("Could not create organization. Did you run supabase/setup.sql? " + error.message);
    org = created;
    await db.from("chatbot_config").insert({ organization_id: org.id }).select();
  }

  // 2. Create the auth user (or find the existing one) and set the password.
  let userId;
  const { data: createdUser, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    if (/already/i.test(createErr.message)) {
      // Find the existing user by listing and matching email, then reset password.
      const { data: list } = await db.auth.admin.listUsers();
      const existing = list?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (!existing) fail("User exists but could not be found via listUsers.");
      userId = existing.id;
      await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
      console.log("ℹ️  User already existed — password reset.");
    } else {
      fail("Could not create user: " + createErr.message);
    }
  } else {
    userId = createdUser.user.id;
    console.log("✅ Admin user created.");
  }

  // 3. Link the user to the org as owner.
  const { error: memErr } = await db
    .from("organization_members")
    .upsert(
      { organization_id: org.id, user_id: userId, role: "owner" },
      { onConflict: "organization_id,user_id" }
    );
  if (memErr) fail("Could not link membership: " + memErr.message);

  console.log("\n========================================");
  console.log("  ADMIN LOGIN READY");
  console.log("========================================");
  console.log("  URL:      /admin/login");
  console.log("  Email:    " + email);
  console.log("  Password: " + password);
  console.log("========================================\n");
}

main().catch((e) => fail(e.message));
