const url = process.argv[2] || "https://wetrackads.com/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
const html = await res.text();
console.log("URL:", res.url, "| HTTP", res.status, "| bytes", html.length);

const checks = {
  "GTM container (GTM-)": /\bGTM-[A-Z0-9]{4,}\b/g,
  "GA4 (G-)": /\bG-[A-Z0-9]{8,}\b/g,
  "Google Ads (AW-)": /\bAW-\d{6,}\b/g,
  "gtag.js": /gtag\/js\?id=/gi,
  "googletagmanager.com": /googletagmanager\.com/gi,
  "connect.facebook.net": /connect\.facebook\.net/gi,
  "fbq(": /\bfbq\(/g,
  "facebook.com/tr": /facebook\.com\/tr/gi,
  "fbevents.js": /fbevents\.js/gi,
};

for (const [label, re] of Object.entries(checks)) {
  const matches = [...new Set([...html.matchAll(re)].map((m) => m[0]))];
  console.log(
    (matches.length ? "✅" : "❌") +
      " " +
      label +
      (matches.length ? "  → " + matches.slice(0, 6).join(", ") : "")
  );
}
