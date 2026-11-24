/**
 * Adds a single keyword-dense "overview / capabilities" knowledge document so
 * the bot can answer meta questions ("what can you help with?", "what do you
 * know?", "what do you offer?") in ONE retrieval — instead of latching onto 4
 * random pages. Also tunes the live chatbot_config welcome message + suggested
 * questions to steer visitors toward what the bot actually answers well.
 *
 * Idempotent: re-running updates the same overview doc instead of duplicating.
 * Usage: node scripts/add-overview-and-welcome.mjs
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

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const slug = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || "support";

const OVERVIEW_TITLE = "Overview — What We Can Help You With";

// Keyword-dense so it out-scores individual pages for "what can you help with /
// what do you offer / what do you do / what do you know" style questions.
// Kept under ~1800 chars so the retriever injects it whole (PER_DOC_CHARS).
const OVERVIEW_CONTENT = `Overview of what we can help you with, what we offer, and what we do. Ask me what you can help with, what services you offer, or what you can do — here is an overview of the help and services available.

CONVERSION TRACKING SETUP: we help with conversion tracking and attribution for Google Ads, Meta (Facebook) Pixel, TikTok, YouTube, LinkedIn, Twitter/X, Microsoft/Bing Ads, Snapchat and Pinterest. We set up accurate conversion tracking so every ad platform reports the right numbers.

ANALYTICS & REPORTING: Google Analytics 4 (GA4) setup, GA4 migration from Universal Analytics, UTM tracking, campaign attribution, Looker Studio dashboards, and data visualization and reporting.

WEBSITES & AUTOMATION: custom web design and web development, marketing automation, GoHighLevel setup, and API and webhook integrations.

TAG ASSISTANT (free): I can run our free Tag Assistant tool on your website to detect which tracking tags (GA4, Google Ads, Meta Pixel, Google Tag Manager) are installed and what is missing — just share your website URL.

CASE STUDIES: real results for ClickFunnels, WebinarJam, EverWebinar, Thinkific/Hyros, Zoom and Acuity.

PRACTICAL HELP: our services, how to get started, how to contact us, how to book a free strategy call, and company/about info.

Not sure what to ask? Try: "What services do you offer?", "Run Tag Assistant on my site", "Do you set up Google Ads and Meta conversion tracking?", "How do I contact you?", or "I'd like to book a call."`;

const WELCOME =
  "👋 Hi! I can help with ad conversion tracking, GA4 & analytics, attribution, and web/marketing setup — and I can run Tag Assistant, a free scan of your website's tracking tags. What can I help you with today?";

const SUGGESTED = [
  "What can you help me with?",
  "Run Tag Assistant on my site",
  "Do you set up GA4 & conversion tracking?",
  "Book a free strategy call",
];

async function main() {
  const { data: org, error: orgErr } = await db
    .from("organizations")
    .select("id, name")
    .eq("slug", slug)
    .single();
  if (orgErr || !org) throw new Error(`Org "${slug}" not found: ${orgErr?.message}`);

  // 1) Upsert the overview doc (update if it already exists).
  const { data: existing } = await db
    .from("knowledge_documents")
    .select("id")
    .eq("organization_id", org.id)
    .eq("title", OVERVIEW_TITLE)
    .maybeSingle();

  if (existing) {
    await db
      .from("knowledge_documents")
      .update({ content: OVERVIEW_CONTENT, status: "indexed" })
      .eq("id", existing.id);
    console.log(`✓ Updated overview doc (${OVERVIEW_CONTENT.length} chars)`);
  } else {
    const { error } = await db.from("knowledge_documents").insert({
      organization_id: org.id,
      title: OVERVIEW_TITLE,
      source_type: "text",
      content: OVERVIEW_CONTENT,
      status: "indexed",
    });
    if (error) throw new Error(error.message);
    console.log(`✓ Inserted overview doc (${OVERVIEW_CONTENT.length} chars)`);
  }

  // 2) Tune the live welcome + suggested questions.
  const { error: cfgErr } = await db
    .from("chatbot_config")
    .update({ welcome_message: WELCOME, suggested_questions: SUGGESTED })
    .eq("organization_id", org.id);
  if (cfgErr) throw new Error(cfgErr.message);
  console.log("✓ Updated welcome message + suggested questions");
  console.log("\nWelcome:", WELCOME);
  console.log("Suggested:", SUGGESTED.join(" | "));
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
