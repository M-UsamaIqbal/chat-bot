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
const orgSlug = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || "support";

const { data: org } = await db.from("organizations").select("id").eq("slug", orgSlug).single();

// Pull the About page text for extra company context.
async function fetchText(u) {
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 KB" } });
    if (!r.ok) return "";
    return (await r.text())
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#038;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  } catch {
    return "";
  }
}

const about = await fetchText("https://wetrackads.com/about-us/");

const docs = [
  {
    title: "Contact & Social Media",
    source_type: "text",
    url: null,
    content: `How to get in touch with WeTrackAds:

- Website: https://wetrackads.com/
- Contact page: https://wetrackads.com/about-us/ (use the contact form on the site to reach the team)
- Instagram: https://www.instagram.com/wetrackads/
- LinkedIn: https://www.linkedin.com/company/wetrackads

If a visitor wants to speak with the team, ask for their name and email and tell them the team will reach out. We do not publish a public phone number — the best way to reach us is the website contact form, LinkedIn, or by leaving an email with the assistant.`,
  },
];

if (about && about.length > 150) {
  docs.push({
    title: "About WeTrackAds",
    source_type: "url",
    url: "https://wetrackads.com/about-us/",
    content: about,
  });
}

for (const d of docs) {
  await db
    .from("knowledge_documents")
    .delete()
    .eq("organization_id", org.id)
    .eq("title", d.title);
  const { error } = await db.from("knowledge_documents").insert({
    organization_id: org.id,
    status: "indexed",
    ...d,
  });
  console.log(error ? "❌ " + d.title + ": " + error.message : "✅ Added: " + d.title);
}
