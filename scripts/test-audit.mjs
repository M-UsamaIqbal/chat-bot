/**
 * Deterministic unit test for analyzeCorpus — the GTM-detection logic.
 * Run: node scripts/test-audit.mjs   (dev server must be running for the live test)
 *
 * Verifies the fix: a tag that lives ONLY in the GTM container (did not fire on
 * the live page) is still detected AND flagged viaGtm — while tags that fire
 * directly on the page are NOT flagged viaGtm.
 */
import {
  analyzeCorpus,
  buildInsights,
  ipIsPrivate,
  isPublicHost,
} from "../src/lib/audit.ts";

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
const by = (ts, k) => ts.find((t) => t.key === k);

// --- Case 1: tags configured ONLY inside the GTM container (consent-gated,
//     never fired on the page). This is the scenario the fix exists for.
console.log("Case 1: GA4 + Meta only in GTM container (not on page)");
{
  const page = `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCD12"></script>`;
  const container = `gtag/js?id=G-TESTGA4ID some config connect.facebook.net fbevents.js fbq('init','123456789012345')`;
  const t = analyzeCorpus(page, container);
  check("GTM detected (found)", by(t, "gtm").found === true);
  check("GTM itself NOT flagged viaGtm", by(t, "gtm").viaGtm === false);
  check("GA4 detected via container (found)", by(t, "ga4").found === true);
  check("GA4 flagged viaGtm=true", by(t, "ga4").viaGtm === true);
  check("Meta detected via container (found)", by(t, "meta").found === true);
  check("Meta flagged viaGtm=true", by(t, "meta").viaGtm === true);
}

// --- Case 2: tag fires directly on the page -> found, but NOT viaGtm.
console.log("\nCase 2: GA4 fires directly on page (not only via GTM)");
{
  const page = `gtag/js?id=G-PAGE1234 fired directly`;
  const container = `gtag/js?id=G-PAGE1234`; // also in container, but page wins
  const t = analyzeCorpus(page, container);
  check("GA4 found", by(t, "ga4").found === true);
  check("GA4 NOT viaGtm (fired on page)", by(t, "ga4").viaGtm === false);
}

// --- Case 3: no GTM at all (wegotteez-style control).
console.log("\nCase 3: no GTM container");
{
  const page = `gtag/js?id=G-DIRECT12 AW-1008637464 connect.facebook.net`;
  const t = analyzeCorpus(page, "");
  check("GTM not found", by(t, "gtm").found === false);
  check("GA4 found, not viaGtm", by(t, "ga4").found === true && by(t, "ga4").viaGtm === false);
  check("Google Ads found", by(t, "google_ads").found === true);
}

// --- Case 4: prescriptive insights + weighted grade.
console.log("\nCase 4: insights & grade");
{
  // Full stack on page -> high grade, no critical issues, a "good" summary.
  const full = analyzeCorpus(
    `gtm.js?id=GTM-ABCD12 gtag/js?id=G-FULL1234 AW-1234567 fbq('init','123456789012345')`,
    ""
  );
  const { insights: fi, grade: fg } = buildInsights(full);
  check("full stack grade is 100", fg === 100);
  check("full stack has no critical issues", fi.every((i) => i.severity !== "critical"));

  // Empty site -> low grade, GA4 + Ads flagged critical.
  const none = analyzeCorpus(`<html></html>`, "");
  const { insights: ni, grade: ng } = buildInsights(none);
  check("empty site grade is 0", ng === 0);
  check(
    "empty site flags missing GA4 as critical",
    ni.some((i) => i.severity === "critical" && /GA4/.test(i.title))
  );
  check(
    "empty site flags missing Google Ads as critical",
    ni.some((i) => i.severity === "critical" && /Google Ads/.test(i.title))
  );

  // Tag only in GTM container -> "isn't firing" warning.
  const gated = analyzeCorpus(
    `gtm.js?id=GTM-ABCD12`,
    `gtag/js?id=G-GATED123 connect.facebook.net fbq('init','123456789012345')`
  );
  const { insights: gi } = buildInsights(gated);
  check(
    "consent-gated tag produces an 'isn't firing' warning",
    gi.some((i) => /isn't firing/.test(i.title))
  );
}

// --- Case 5: SSRF guards (private IPs + internal hostnames blocked).
console.log("\nCase 5: SSRF host/IP guards");
{
  // Private / loopback / link-local / CGNAT / IPv6 must be flagged private.
  for (const ip of ["10.0.0.5", "127.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "::1", "::ffff:10.0.0.1", "fd00::1"]) {
    check(`ipIsPrivate("${ip}") === true`, ipIsPrivate(ip) === true);
  }
  // Public IPs must NOT be flagged private.
  for (const ip of ["8.8.8.8", "1.1.1.1", "142.250.72.14"]) {
    check(`ipIsPrivate("${ip}") === false`, ipIsPrivate(ip) === false);
  }
  // Internal hostnames + private IP literals blocked by isPublicHost.
  for (const h of ["localhost", "foo.local", "svc.internal", "127.0.0.1", "10.1.2.3", "169.254.169.254"]) {
    check(`isPublicHost("${h}") === false`, isPublicHost(h) === false);
  }
  // Normal public hostnames allowed.
  for (const h of ["wetrackads.com", "example.com", "8.8.8.8"]) {
    const expected = h === "8.8.8.8"; // IP literal public -> allowed
    check(`isPublicHost("${h}") allowed`, isPublicHost(h) === (h.includes(".com") ? true : expected));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
