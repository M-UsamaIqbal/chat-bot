const UA = { "User-Agent": "Mozilla/5.0 KB" };
const ROOT = process.argv[2] || "https://wetrackads.com/";

async function grab(u) {
  try {
    const r = await fetch(u, { headers: UA, redirect: "follow" });
    return r.ok ? await r.text() : "";
  } catch {
    return "";
  }
}

const home = await grab(ROOT);
const origin = new URL(ROOT).origin;

const contactLinks = [...new Set([...home.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))]
  .filter((h) => /contact|about/i.test(h))
  .map((h) => (h.startsWith("http") ? h : origin + h));

console.log("Contact/about links:", contactLinks.slice(0, 8).join(" | ") || "(none)");

let all = home;
for (const l of contactLinks.slice(0, 4)) all += " " + (await grab(l));

const emails = [...new Set([...all.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0]))]
  .filter((e) => !/\.(png|jpg|jpeg|webp|svg|gif)$/i.test(e));
const tels = [...new Set([...all.matchAll(/tel:([+0-9()\-\s]{6,})/gi)].map((m) => m[1].trim()))];
const socialRe = /https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin|twitter|youtube|tiktok)\.[^"'\s)<]+/gi;
const socials = [...new Set([...all.matchAll(socialRe)].map((m) => m[0]))]
  .filter((s) => !/sharer|share\.php|intent\/tweet/i.test(s));

console.log("\nEMAILS :", emails.join(", ") || "(none)");
console.log("PHONES :", tels.join(", ") || "(none)");
console.log("SOCIALS:\n  " + (socials.join("\n  ") || "(none)"));
