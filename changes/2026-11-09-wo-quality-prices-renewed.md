# Model price table renewed, and CI now fails a week before it expires

- **What:** `apps/tracy-web/src/opportunities-build/quality-prices.json` expired on 2026-10-27, and the quality model refuses to run past `validUntil` (`QUALITY_PRICE_UNKNOWN`). The ops page "Test with pixels" button stayed disabled, no new pixel proof could be made, the last proof aged out after 7 days, and the vision door reported `not_tested`. Prices re-verified against the provider page (unchanged, peak rates kept), `verifiedAt` and `validUntil` renewed (30 days). New test `wo-quality-prices-expiry-guard.test.mjs` fails when fewer than 7 days remain, so CI goes red before the table expires.
- **Who:** Akemi, with Claude.
- **PR:** see the pull request that adds this file.
- **Affects:** every deployment. Logo text reading and menu photo reading were skipped on every research run since 2026-10-27. After deploy, run "Test with pixels" once on /ops/model to restore the vision proof. Renew the table (and the date) before it lapses again.
