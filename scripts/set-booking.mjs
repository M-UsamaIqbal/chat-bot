import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(p = ".env.local") {
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const BOOKING_URL = process.argv[2] || "https://wetrackads.com/book-a-strategy-call/";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const orgSlug = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || "support";

const { data: org } = await db.from("organizations").select("id").eq("slug", orgSlug).single();
if (!org) throw new Error("Org not found");

// 1. Set the booking URL in the chatbot config.
const { error: cfgErr } = await db
  .from("chatbot_config")
  .update({ booking_url: BOOKING_URL })
  .eq("organization_id", org.id);
console.log(cfgErr ? "❌ config: " + cfgErr.message : "✅ Booking URL set: " + BOOKING_URL);

// 2. Index the booking page content so the bot can describe it.
try {
  const r = await fetch(BOOKING_URL, { headers: { "User-Agent": "Mozilla/5.0 KB" } });
  if (r.ok) {
    const text = (await r.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
    const content =
      `To book a consultation / strategy call, use this link: ${BOOKING_URL}\n\n` + text;
    await db.from("knowledge_documents").delete().eq("organization_id", org.id).eq("url", BOOKING_URL);
    const { error } = await db.from("knowledge_documents").insert({
      organization_id: org.id,
      title: "Book a Strategy Call",
      source_type: "url",
      url: BOOKING_URL,
      content,
      status: "indexed",
    });
    console.log(error ? "❌ page: " + error.message : "✅ Booking page indexed.");
  } else {
    console.log("⚠️ Could not fetch booking page (HTTP " + r.status + ") — URL still set in config.");
  }
} catch (e) {
  console.log("⚠️ Could not fetch booking page:", e.message);
}
