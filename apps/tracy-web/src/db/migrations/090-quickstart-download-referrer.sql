-- The page a quickstart zip request came from (11/10/2026), recorded from this migration on and
-- read by staff on App Statistic only. What the browser or the joomlart.com link said, cleaned by
-- `src/lib/referrer.js` (absolute http(s), scheme + host + path only, at most 512 characters):
-- joomlart.com sends only its origin unless its button adds `&ref=<page url>`. Rows written before
-- this column existed stay null — not recorded, not "no referrer".
alter table quickstart_download add column referrer text;
