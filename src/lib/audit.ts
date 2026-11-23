/**
 * Ad-tracking audit: fetches a public web page and detects which analytics and
 * ad-conversion tags are installed (GA4, GTM, Meta Pixel, Google Ads, TikTok,
 * LinkedIn, etc.). On-brand lead magnet for an attribution company.
 *
 * SSRF-guarded: only public http(s) hosts are fetched.
 */

import type { AuditResult, AuditInsight, TrackerResult } from "@/lib/types";
export type { AuditResult, TrackerResult };

interface Signature {
  key: string;
  name: string;
  category: "analytics" | "ads" | "other";
  core?: boolean;
  patterns: RegExp[];
  idRe?: RegExp;
}

// The four tags that matter most for ad tracking & attribution. Each is
// detected on the page AND inside the Google Tag Manager container (like Tag
// Assistant), so tags fired through GTM are surfaced with their account IDs.
const SIGNATURES: Signature[] = [
  {
    key: "gtm",
    name: "Google Tag Manager",
    category: "analytics",
    core: true,
    patterns: [/googletagmanager\.com\/gtm\.js/i, /\bGTM-[A-Z0-9]{4,}\b/],
    idRe: /\bGTM-[A-Z0-9]{4,}\b/g,
  },
  {
    key: "ga4",
    name: "Google Analytics 4 (GA4)",
    category: "analytics",
    core: true,
    patterns: [
      /gtag\/js\?id=G-[A-Z0-9]+/i,
      /\bG-[A-Z0-9]{8,}\b/,
      /google-analytics\.com\/g\/collect/i,
    ],
    idRe: /\bG-[A-Z0-9]{8,}\b/g,
  },
  {
    key: "google_ads",
    name: "Google Ads",
    category: "ads",
    core: true,
    patterns: [
      /googleadservices\.com/i,
      /\bAW-\d{6,}\b/,
      /googleads\.g\.doubleclick\.net/i,
    ],
    idRe: /\bAW-\d{6,}\b/g,
  },
  {
    key: "meta",
    name: "Meta Pixel (Facebook)",
    category: "ads",
    core: true,
    patterns: [
      /connect\.facebook\.net/i,
      /\bfbq\(/,
      /facebook\.com\/tr\b/i,
    ],
    idRe:
      /fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,})['"]|"pixelId"\s*:\s*"?(\d{6,})|facebook[_-]?pixel[_-]?id["']?\s*[:=]\s*["']?(\d{6,})/gi,
  },
];

/** Normalizes user input into an http(s) URL, defaulting to https://. */
export function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Blocks private / loopback / link-local hosts to prevent SSRF. */
function isPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal"))
    return false;
  // IPv6 loopback / unique-local
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd")) return false;
  // IPv4 private ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchText(
  url: string,
  accept = "text/html",
  ms = 10_000
): Promise<{ ok: boolean; status: number; finalUrl: string; text: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: accept },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = (await res.text()).slice(0, 800_000);
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, text };
  } catch {
    return { ok: false, status: 0, finalUrl: url, text: "" };
  }
}

function extractIds(corpus: string, re?: RegExp): string[] {
  if (!re) return [];
  const ids: string[] = [];
  for (const m of corpus.matchAll(re)) {
    // Prefer the first defined capture group; fall back to the whole match.
    const captured = m.slice(1).find((g) => g != null);
    ids.push(captured ?? m[0]);
  }
  return [...new Set(ids)].slice(0, 8);
}

/**
 * Builds the 4 tracker results from the live page (captured network requests +
 * rendered HTML + dataLayer) AND, separately, the fetched GTM container
 * definition(s). A tracker that only appears in the container — not in the live
 * page — is flagged `viaGtm` (configured in GTM but didn't fire during the scan,
 * e.g. consent-gated or trigger-gated), mirroring Tag Assistant.
 */
export function analyzeCorpus(pageText: string, containerText = ""): TrackerResult[] {
  const uniq = (arr: string[]) => [...new Set(arr)].slice(0, 8);
  const corpus = pageText + "\n" + containerText;

  const matchGtm = (t: string) =>
    uniq([...t.matchAll(/\bGTM-[A-Z0-9]{4,}\b/g)].map((m) => m[0]));
  const matchGa4 = (t: string) =>
    uniq([...t.matchAll(/\bG-[A-Z0-9]{8,}\b/g)].map((m) => m[0]));
  const matchAds = (t: string) =>
    uniq([
      ...[...t.matchAll(/\bAW-\d{6,}\b/g)].map((m) => m[0]),
      ...[...t.matchAll(/googleadservices\.com\/pagead\/conversion(?:_async)?\/(\d{6,})/g)].map(
        (m) => "AW-" + m[1]
      ),
      ...[...t.matchAll(/\/pagead\/1p-conversion\/(\d{6,})/g)].map((m) => "AW-" + m[1]),
    ]);
  const matchMeta = (t: string) =>
    uniq([
      ...[...t.matchAll(/facebook\.com\/tr\/?\?[^"'\s]*\bid=(\d{6,})/g)].map((m) => m[1]),
      ...[...t.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,})['"]/g)].map((m) => m[1]),
    ]);

  const gaRe =
    /gtag\/js\?id=G-|google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/i;
  const adsRe =
    /googleadservices\.com|googleads\.g\.doubleclick\.net\/pagead|google\.com\/pagead\/1p-conversion/i;
  const metaRe = /connect\.facebook\.net|facebook\.com\/tr\b|fbevents\.js|\bfbq\(/i;

  // Per-tracker presence on the live page vs. inside the GTM container.
  const inPage = {
    gtm: matchGtm(pageText).length > 0 || /googletagmanager\.com\/gtm\.js/i.test(pageText),
    ga4: matchGa4(pageText).length > 0 || gaRe.test(pageText),
    google_ads: matchAds(pageText).length > 0 || adsRe.test(pageText),
    meta: matchMeta(pageText).length > 0 || metaRe.test(pageText),
  };
  const inContainer = containerText
    ? {
        gtm: false, // the container IS GTM; don't flag GTM itself as "via GTM"
        ga4: matchGa4(containerText).length > 0 || gaRe.test(containerText),
        google_ads: matchAds(containerText).length > 0 || adsRe.test(containerText),
        meta: matchMeta(containerText).length > 0 || metaRe.test(containerText),
      }
    : { gtm: false, ga4: false, google_ads: false, meta: false };

  return [
    {
      key: "gtm",
      name: "Google Tag Manager",
      category: "analytics",
      found: inPage.gtm,
      ids: matchGtm(corpus),
      viaGtm: false,
    },
    {
      key: "ga4",
      name: "Google Analytics 4 (GA4)",
      category: "analytics",
      found: inPage.ga4 || inContainer.ga4,
      ids: matchGa4(corpus),
      viaGtm: !inPage.ga4 && inContainer.ga4,
    },
    {
      key: "google_ads",
      name: "Google Ads",
      category: "ads",
      found: inPage.google_ads || inContainer.google_ads,
      ids: matchAds(corpus),
      viaGtm: !inPage.google_ads && inContainer.google_ads,
    },
    {
      key: "meta",
      name: "Meta Pixel (Facebook)",
      category: "ads",
      found: inPage.meta || inContainer.meta,
      ids: matchMeta(corpus),
      viaGtm: !inPage.meta && inContainer.meta,
    },
  ];
}

/** Best-effort: accept a cookie-consent banner so consent-gated tags fire. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function acceptConsent(page: any) {
  const names = [/accept all/i, /allow all/i, /accept/i, /agree/i, /got it/i, /allow/i];
  for (const re of names) {
    try {
      const btn = page.getByRole("button", { name: re });
      if ((await btn.count()) > 0) {
        await btn.first().click({ timeout: 1500 });
        return;
      }
    } catch {
      /* keep trying other labels */
    }
  }
  for (const sel of [
    "#onetrust-accept-btn-handler",
    ".cky-btn-accept",
    "[aria-label='Accept all']",
    "button[mode='primary']",
  ]) {
    try {
      await page.click(sel, { timeout: 1000 });
      return;
    } catch {
      /* not present */
    }
  }
}

/**
 * Tag Assistant-style scan: loads the page in headless Chrome, runs its JS,
 * accepts cookie consent, and captures the ACTUAL tag network requests — so it
 * sees GA4 / Google Ads / Meta Pixel / GTM even when injected at runtime.
 */
/**
 * Launches headless Chromium. On serverless (Vercel/Lambda) there is no system
 * Chrome, so we use @sparticuz/chromium's bundled binary via playwright-core.
 * Locally we use the full playwright package (with its own browser download).
 * Throws "playwright-unavailable" so the caller can fall back to the HTML scan.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function launchBrowser(): Promise<any> {
  const isServerless =
    !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    try {
      const sparticuz = (await import("@sparticuz/chromium")).default;
      const { chromium } = await import("playwright-core");
      return await chromium.launch({
        args: sparticuz.args,
        executablePath: await sparticuz.executablePath(),
        headless: true,
      });
    } catch {
      throw new Error("playwright-unavailable");
    }
  }

  try {
    const { chromium } = await import("playwright");
    return await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch {
    throw new Error("playwright-unavailable");
  }
}

async function auditWithBrowser(url: string): Promise<AuditResult> {
  const checkedAt = new Date().toISOString();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      userAgent: BROWSER_UA,
      viewport: { width: 1366, height: 850 },
    });
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (r: { url(): string }) => {
      const u = r.url();
      if (u.length < 2000) requests.push(u);
    });

    let finalUrl = url;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch {
      /* continue — some requests may already be captured */
    }
    finalUrl = page.url() || url;
    await page.waitForTimeout(3500);
    await acceptConsent(page);
    await page.waitForTimeout(3500);

    const html: string = await page.content().catch(() => "");
    const dataLayer: string = await page
      .evaluate(() => {
        try {
          // @ts-expect-error browser context
          return JSON.stringify(window.dataLayer || []).slice(0, 30000);
        } catch {
          return "";
        }
      })
      .catch(() => "");

    const pageText = requests.join("\n") + "\n" + html + "\n" + dataLayer;

    // Also fetch the GTM container definition(s) so we surface tags that are
    // configured in GTM but didn't fire during the scan (consent-/trigger-gated).
    const gtmIds = [
      ...new Set([...pageText.matchAll(/GTM-[A-Z0-9]{4,}/g)].map((m) => m[0])),
    ].slice(0, 4);
    let containerText = "";
    for (const id of gtmIds) {
      const c = await fetchText(
        `https://www.googletagmanager.com/gtm.js?id=${id}`,
        "application/javascript"
      );
      if (c.ok) containerText += "\n" + c.text;
    }

    const trackers = analyzeCorpus(pageText, containerText);
    const foundCount = trackers.filter((t) => t.found).length;
    const { insights, grade } = buildInsights(trackers);

    return {
      ok: true,
      url,
      finalUrl,
      trackers,
      foundCount,
      coreFound: foundCount,
      coreTotal: trackers.length,
      viaGtm: trackers.find((t) => t.key === "gtm")?.found ?? false,
      checkedAt,
      insights,
      grade,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Public entry point. Tries the accurate headless-browser scan first (runs JS,
 * sees runtime-injected tags), and falls back to the fast HTML + GTM-container
 * scan if the browser is unavailable or fails.
 */
export async function auditTracking(rawUrl: string): Promise<AuditResult> {
  const url = normalizeUrl(rawUrl);
  if (!url)
    return {
      ok: false,
      url: rawUrl,
      finalUrl: rawUrl,
      trackers: [],
      foundCount: 0,
      coreFound: 0,
      coreTotal: 4,
      viaGtm: false,
      checkedAt: new Date().toISOString(),
      error: "That doesn't look like a valid website URL.",
    };
  if (!isPublicHost(new URL(url).hostname))
    return {
      ok: false,
      url: rawUrl,
      finalUrl: url,
      trackers: [],
      foundCount: 0,
      coreFound: 0,
      coreTotal: 4,
      viaGtm: false,
      checkedAt: new Date().toISOString(),
      error: "Only public websites can be scanned.",
    };

  try {
    const result = await auditWithBrowser(url);
    // If the browser scan reached the page but found nothing, still return it.
    return result;
  } catch (err) {
    if ((err as Error)?.message !== "playwright-unavailable") {
      console.error("Browser audit failed, falling back to HTML:", err);
    }
    return auditWithHtml(rawUrl);
  }
}

async function auditWithHtml(rawUrl: string): Promise<AuditResult> {
  const checkedAt = new Date().toISOString();
  const url = normalizeUrl(rawUrl);
  const base: AuditResult = {
    ok: false,
    url: rawUrl,
    finalUrl: url || rawUrl,
    trackers: [],
    foundCount: 0,
    coreFound: 0,
    coreTotal: SIGNATURES.filter((s) => s.core).length,
    viaGtm: false,
    checkedAt,
  };

  if (!url) return { ...base, error: "That doesn't look like a valid website URL." };
  if (!isPublicHost(new URL(url).hostname))
    return { ...base, error: "Only public websites can be scanned." };

  // 1) Fetch the page itself.
  const page = await fetchText(url);
  const finalUrl = page.finalUrl;
  if (!page.ok) {
    return {
      ...base,
      finalUrl,
      error: page.status
        ? `The site returned HTTP ${page.status}.`
        : "Couldn't reach that website. Check the URL and try again.",
    };
  }
  const html = page.text;

  // 2) Resolve Google Tag Manager containers and fetch their definitions, so we
  //    can see tags fired THROUGH GTM (like Tag Assistant does), not just inline.
  const gtmIds = [...new Set([...html.matchAll(/GTM-[A-Z0-9]{4,}/g)].map((m) => m[0]))].slice(0, 4);
  let containerText = "";
  for (const id of gtmIds) {
    const c = await fetchText(
      `https://www.googletagmanager.com/gtm.js?id=${id}`,
      "application/javascript"
    );
    if (c.ok) containerText += "\n" + c.text;
  }

  const corpus = html + "\n" + containerText;

  // 3) Detect each tracker against page + GTM container; record IDs + source.
  const trackers: TrackerResult[] = SIGNATURES.map((sig) => {
    const inPage = sig.patterns.some((re) => re.test(html));
    const inContainer = containerText
      ? sig.patterns.some((re) => re.test(containerText))
      : false;
    const found = inPage || inContainer;
    const ids = found ? extractIds(corpus, sig.idRe) : [];
    return {
      key: sig.key,
      name: sig.name,
      found,
      ids,
      category: sig.category,
      viaGtm: !inPage && inContainer,
    };
  });

  const foundCount = trackers.filter((t) => t.found).length;
  const coreFound = trackers.filter(
    (t) => t.found && SIGNATURES.find((s) => s.key === t.key)?.core
  ).length;
  const viaGtm = trackers.find((t) => t.key === "gtm")?.found ?? false;
  const { insights, grade } = buildInsights(trackers);

  return {
    ok: true,
    url: rawUrl,
    finalUrl,
    trackers,
    foundCount,
    coreFound,
    coreTotal: base.coreTotal,
    viaGtm,
    checkedAt,
    insights,
    grade,
  };
}

/**
 * Turns the raw tracker list into prescriptive, money-focused findings and an
 * attribution-readiness grade. This is what makes the audit *useful* rather than
 * a checklist: it tells the visitor what each gap costs them.
 */
export function buildInsights(trackers: TrackerResult[]): {
  insights: AuditInsight[];
  grade: number;
} {
  const t = (key: string) => trackers.find((x) => x.key === key);
  const gtm = t("gtm");
  const ga4 = t("ga4");
  const ads = t("google_ads");
  const meta = t("meta");
  const insights: AuditInsight[] = [];

  // Weighted attribution-readiness grade (GA4 + Ads conversion matter most).
  const weights: Record<string, number> = {
    ga4: 30,
    google_ads: 30,
    meta: 25,
    gtm: 15,
  };
  let grade = 0;
  for (const [key, w] of Object.entries(weights)) if (t(key)?.found) grade += w;

  // GA4 — the measurement foundation.
  if (!ga4?.found) {
    insights.push({
      severity: "critical",
      title: "No GA4 analytics detected",
      impact:
        "You have no first-party record of which pages, campaigns, and channels drive conversions — you're flying blind on ROI and can't prove what's working.",
    });
  } else {
    insights.push({
      severity: "good",
      title: "GA4 is measuring your traffic",
      impact:
        "You have a first-party analytics foundation — the basis for every attribution and optimization decision.",
    });
  }

  // Google Ads conversion tracking.
  if (!ads?.found) {
    insights.push({
      severity: "critical",
      title: "No Google Ads conversion tag",
      impact:
        "If you run Google or YouTube ads, Google can't see which clicks become customers — Smart Bidding optimizes on nothing and budget leaks into losing keywords.",
    });
  }

  // Meta Pixel.
  if (!meta?.found) {
    insights.push({
      severity: "warning",
      title: "No Meta Pixel detected",
      impact:
        "You can't retarget site visitors on Facebook/Instagram and Meta's algorithm can't optimize for buyers. Cold-only targeting typically costs 2–4× more per conversion.",
    });
  }

  // GTM governance.
  if (!gtm?.found) {
    insights.push({
      severity: "warning",
      title: "No Google Tag Manager",
      impact:
        "Every new tag or fix needs a developer and a deploy — slowing you down and risking hard-coded tags that fire inconsistently or break silently.",
    });
  }

  // Tags configured in GTM but not firing on the page (consent/trigger gap).
  for (const tr of trackers) {
    if (tr.viaGtm) {
      insights.push({
        severity: "warning",
        title: `${tr.name} isn't firing on the page`,
        impact:
          "It's configured in your GTM container but didn't fire during the scan — likely blocked by consent or a trigger misconfiguration, so you may be losing data you think you're collecting.",
      });
    }
  }

  // Duplicate GA4 properties double-count events.
  if (ga4?.found && ga4.ids.length > 1) {
    insights.push({
      severity: "warning",
      title: "Multiple GA4 IDs detected",
      impact:
        "More than one GA4 property is loading — events get double-counted, which inflates your numbers and corrupts attribution and conversion rates.",
    });
  }

  // All core present — reinforce, then push toward depth.
  if (ga4?.found && ads?.found && meta?.found) {
    insights.push({
      severity: "good",
      title: "Core ad-tracking stack is in place",
      impact:
        "GA4, Google Ads and Meta are all present. The next wins are accuracy: server-side tracking, consent mode, and deduplicated conversions.",
    });
  }

  return { insights, grade };
}

/** Compact text summary for the AI model to narrate after a tool call. */
export function summarizeAudit(a: AuditResult): string {
  if (!a.ok) return `Audit failed: ${a.error}`;
  const found = a.trackers.filter((t) => t.found).map((t) => t.name);
  const missingCore = a.trackers
    .filter((t) => !t.found && SIGNATURES.find((s) => s.key === t.key)?.core)
    .map((t) => t.name);
  const topIssue = (a.insights ?? []).find((i) => i.severity === "critical")
    ?? (a.insights ?? []).find((i) => i.severity === "warning");
  return [
    `Audit complete for ${a.finalUrl} (a visual report card was shown to the user).`,
    typeof a.grade === "number"
      ? `Attribution-readiness grade: ${a.grade}/100.`
      : "",
    found.length ? `Detected: ${found.join(", ")}.` : "No tracking tags detected.",
    missingCore.length
      ? `Notable missing: ${missingCore.join(", ")}.`
      : "All core ad-tracking tags are present.",
    topIssue
      ? `The biggest issue to call out: ${topIssue.title} — ${topIssue.impact}`
      : "",
    a.viaGtm ? "Some tags may be managed through Google Tag Manager." : "",
    "Lead with the single biggest issue above in one plain sentence (what it costs them), then invite them to book a free strategy call to fix it. The card already shows the full breakdown AND a booking button, so do NOT re-list every tracker and do NOT paste the booking link in your text.",
  ]
    .filter(Boolean)
    .join(" ");
}
