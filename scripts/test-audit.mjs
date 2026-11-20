/**
 * Deterministic unit test for analyzeCorpus — the GTM-detection logic.
 * Run: node scripts/test-audit.mjs   (dev server must be running for the live test)
 *
 * Verifies the fix: a tag that lives ONLY in the GTM container (did not fire on
 * the live page) is still detected AND flagged viaGtm — while tags that fire
 * directly on the page are NOT flagged viaGtm.
 */
import { analyzeCorpus } from "../src/lib/audit.ts";

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
