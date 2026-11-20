/**
 * Full-site importer: crawls an ENTIRE website (sitemap + deep link-following)
 * and loads each page into the knowledge base so the chatbot can answer from it.
 *
 * Usage:  node scripts/import-website.mjs https://example.com/ [maxPages]
 * Reads Supabase + org config from .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path = ".env.local") {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const ROOT = process.argv[2] || "https://wetrackads.com/";
const MAX_PAGES = parseInt(process.argv[3] || "250", 10);
const PER_PAGE_CHARS = 6000;
const origin = new URL(ROOT).origin;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const orgSlug = process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || "support";
const UA = { "User-Agent": "Mozilla/5.0 Support-KB-Importer" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD = /(\/feed|wp-json|wp-admin|wp-content|xmlrpc|\/comments|\/cart|\/checkout|\?|#)|\.(css|js|png|jpe?g|webp|svg|gif|ico|pdf|zip|mp4|woff2?)($|\?)/i;

function norm(href) {
  try {
    if (href.startsWith("//")) href = "https:" + href;
    else if (href.startsWith("/")) href = origin + href;
    const u = new URL(href);
    if (u.origin !== origin) return null;
    return u.origin + u.pathname.replace(/\/+$/, "") + "/";
  } catch {
    return null;
  }
}

async function get(u) {
  const r = await fetch(u, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const ct = r.headers.get("content-type") || "";
  return { ct, body: await r.text() };
}

function stripToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;|&#038;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function titleOf(html, fb) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return (m ? m[1] : fb).replace(/\s+/g, " ").replace(/&#038;|&amp;/g, "&").trim().slice(0, 180);
}
function linksIn(html) {
  return [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((m) => norm(m[1]))
    .filter((u) => u && !BAD.test(u));
}

async function sitemapUrls() {
  const candidates = [
    "/sitemap.xml",
    "/wp-sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
  ];
  const found = new Set();
  const queue = [...candidates.map((c) => origin + c)];
  const seen = new Set();
  while (queue.length && found.size < MAX_PAGES * 2) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const { body } = await get(sm);
      const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      for (const loc of locs) {
        if (/\.xml($|\?)/i.test(loc)) queue.push(loc);
        else {
          const n = norm(loc);
          if (n && !BAD.test(n)) found.add(n);
        }
      }
    } catch {
      /* this sitemap path doesn't exist — fine */
    }
  }
  return [...found];
}

async function main() {
  const { data: org } = await db.from("organizations").select("id").eq("slug", orgSlug).single();
  if (!org) throw new Error("Org '" + orgSlug + "' not found. Run setup.sql first.");

  console.log("Discovering pages on", origin, "...");
  let urls = await sitemapUrls();
  console.log("Sitemap pages:", urls.length);

  // Seed the crawl frontier with the root + sitemap results, then BFS-fill.
  const queue = [norm(ROOT), ...urls].filter(Boolean);
  const visited = new Set();
  const toImport = [];

  while (queue.length && toImport.length < MAX_PAGES) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    try {
      const { ct, body } = await get(url);
      if (!/text\/html/i.test(ct)) continue;
      toImport.push({ url, title: titleOf(body, url), text: stripToText(body) });
      // Follow links we haven't seen (deep crawl).
      if (toImport.length < MAX_PAGES) {
        for (const l of linksIn(body)) if (!visited.has(l)) queue.push(l);
      }
      process.stdout.write(".");
      await sleep(120);
    } catch {
      /* skip unreachable page */
    }
  }
  console.log("\nFetched", toImport.length, "pages. Saving...");

  let ok = 0;
  for (const p of toImport) {
    if (!p.text || p.text.length < 120) continue;
    const content = p.text.slice(0, PER_PAGE_CHARS);
    await db.from("knowledge_documents").delete().eq("organization_id", org.id).eq("url", p.url);
    const { error } = await db.from("knowledge_documents").insert({
      organization_id: org.id,
      title: p.title,
      source_type: "url",
      url: p.url,
      content,
      status: "indexed",
    });
    if (!error) {
      ok++;
      console.log("  ✅", p.title.slice(0, 64));
    } else {
      console.log("  ❌", p.url, error.message);
    }
  }

  const { count } = await db
    .from("knowledge_documents")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org.id);
  console.log("\nImported", ok, "pages. Knowledge base now has", count, "documents.");
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
