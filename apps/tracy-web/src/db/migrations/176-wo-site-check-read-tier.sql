-- How a site check read the homepage (`src/escalating-fetch.js`): `read_via` is the tier whose answer the verdict was
-- judged from ('node' = the pinned Node fetch, 'impit' = the Chrome-fingerprint client through the guarded proxy), and
-- `read_attempts` every request of the read as {tier, status, reason, ms}, at most 12 then {truncated: true}. Both stay
-- null when the two-tier read is off (WO_SITE_READ_TLS). Expand-only: an older image ignores them.
alter table wo_site_check add column if not exists read_via text;
alter table wo_site_check add column if not exists read_attempts jsonb;
