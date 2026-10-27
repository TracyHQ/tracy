-- apps/tracy-web/src/db/migrations/129-website-opportunities-site-checks.sql
-- Website Opportunities site checks (tasks/spec-wo-find-v2.md §1, §3): what is known about a
-- restaurant's CURRENT website — its mobile PageSpeed scores, whether it answers at all, the CMS it
-- runs and the year in its footer — measured in the background after a search and kept 30 days.
--
-- Deployment-wide, NOT per account: a restaurant's site is the same whoever searches for it, and a
-- Lighthouse run costs 10–30 s, so one check serves every account. `url_key` is the normalised
-- address (scheme + lower-case host + path, no query, hash or trailing slash). The row IS the
-- queue: a worker leases queued rows (`lease_until`, `attempts`), so a restart or a second web
-- instance never loses or doubles a check. `opportunities/site-checks.js` is the only writer.
--
--   status        queued (waiting or leased) · done (scores and stack read) · down (DNS or connect
--                 failure, or HTTP ≥ 500 twice) · blocked (HTTP 401/403/429 or a bot challenge) ·
--                 failed (the guard refused the address, three attempts, or nothing answered)
--   final_url     where the homepage ended after redirects; `https` is its scheme
--   performance   Lighthouse mobile scores 0–100; null when PageSpeed did not answer
--   seo
--   lcp_ms        Largest Contentful Paint, mobile
--   mobile_friendly  viewport and tap-target audits pass; null when PageSpeed ran no viewport audit
--   cms / cms_version / copyright_year   from PageSpeed's stackPacks, then the HTML (null = unknown)
--   emails / socials   contact facts read off the homepage: ["a@b"], {"facebook": "https://…"}
--   error         a short code when not done (url_blocked, dns, timeout, http_503, challenge, attempts)
--   lease_until   held by a worker until then; null or past = claimable
--   attempts      claims so far; the third failure is final
create table if not exists wo_site_check (
  url_key text primary key,
  url text not null,
  final_url text,
  status text not null check (status in ('queued', 'done', 'down', 'blocked', 'failed')),
  performance integer,
  seo integer,
  lcp_ms integer,
  https boolean,
  mobile_friendly boolean,
  cms text,
  cms_version text,
  copyright_year integer,
  emails jsonb,
  socials jsonb,
  error text,
  queued_at timestamptz not null default now(),
  lease_until timestamptz,
  attempts integer not null default 0,
  checked_at timestamptz
);
create index if not exists wo_site_check_queued on wo_site_check (queued_at) where status = 'queued';
