/**
 * Builds a single "Complete list of services" knowledge document from the
 * service pages already indexed in the KB, so the chatbot can enumerate EVERY
 * service in one retrieval (instead of only the 3 highlighted on the homepage).
 *
 * Usage: node scripts/add-services-index.mjs
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
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const slug = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || "support";

const { data: org } = await db.from("organizations").select("id").eq("slug", slug).single();
if (!org) throw new Error("Org not found");

const INDEX_URL = "https://wetrackads.com/#all-services";

const { data: docs } = await db
  .from("knowledge_documents")
  .select("title, url, content")
  .eq("organization_id", org.id)
  .eq("status", "indexed")
  .limit(300);

const clean = (s) =>
  (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();

// A page is a "service" if it lives under /services/ or is a *-conversion-tracking
// setup page (platform-specific services that live at the site root).
const isService = (u = "") =>
  /\/services\//i.test(u) || /conversion-tracking\/?$/i.test(u);

// Short, factual service name: prefer the URL slug (stable, concise) and fall
// back to a trimmed page title. Keeps the catalog compact so all services fit
// inside the retriever's per-doc char budget.
const titleCase = (seg) =>
  seg
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bApi\b/g, "API")
    .replace(/\bUtm\b/g, "UTM")
    .replace(/\bGa4\b/g, "GA4")
    .replace(/\bGohighlevel\b/gi, "GoHighLevel")
    .replace(/\bWoocommerce\b/gi, "WooCommerce")
    .replace(/\bTiktok\b/gi, "TikTok")
    .replace(/\bYoutube\b/gi, "YouTube")
    .replace(/\bLinkedin\b/gi, "LinkedIn")
    .replace(/\bAnd\b/g, "&")
    .replace(/\bService\b$/i, "")
    .trim();

const nameOf = (title, url) => {
  if (url) {
    const path = url.split("#")[0].replace(/\/+$/, "");
    const seg = path.split("/").pop() || "";
    const n = titleCase(seg);
    if (n) return n;
  }
  return clean(title)
    .replace(/\s*[|–-]\s*WeTrackAds.*$/i, "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .trim();
};

const services = (docs || [])
  .filter((d) => d.url && isService(d.url))
  .map((d) => ({ name: nameOf(d.title, d.url), url: d.url }))
  .filter((s) => s.name)
  // De-dupe by URL.
  .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
  .sort((a, b) => a.name.localeCompare(b.name));

if (services.length === 0) throw new Error("No service pages found in KB — run import-website.mjs first.");

const lines = services.map((s, i) => `${i + 1}. ${s.name}`);

// Keyword-dense preamble: the retriever scores "services" occurrences (capped
// at 10) + a title match, so this catalog must out-rank individual service pages
// to be retrieved for a generic "what services do you offer?" question.
const content =
  `Complete list of all WeTrackAds services — the full services catalog and services list. ` +
  `This is the complete list of services we offer. When asked what services we offer, or which services are available, ` +
  `list ALL ${services.length} of the services below, not just a few of the services. Our services include:\n\n` +
  lines.join("\n") +
  `\n\nThese services cover conversion tracking, attribution, analytics, UTM tracking, ` +
  `data visualization, marketing automation, GoHighLevel setup, API & webhook integration, ` +
  `web design and custom web development. To get started with any of these services, book a strategy call.`;

const title = "All Services — Complete List (Services Catalog)";

await db
  .from("knowledge_documents")
  .delete()
  .eq("organization_id", org.id)
  .eq("url", INDEX_URL);

const { error } = await db.from("knowledge_documents").insert({
  organization_id: org.id,
  title,
  source_type: "text",
  url: INDEX_URL,
  content,
  status: "indexed",
});

console.log(error ? "❌ " + error.message : `✅ Services index added with ${services.length} services (${content.length} chars):`);
if (!error) services.forEach((s) => console.log("   - " + s.name));
