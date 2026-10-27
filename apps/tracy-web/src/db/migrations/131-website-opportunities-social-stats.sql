-- apps/tracy-web/src/db/migrations/131-website-opportunities-social-stats.sql
-- Website Opportunities social stats (tasks/todo-wo-social-stats.md step B): follower and posting
-- figures of a restaurant's Facebook, Instagram, TikTok and YouTube pages, fetched in the background
-- through RapidAPI listings and the YouTube Data API, kept 7 days.
--
-- Deployment-wide, NOT per account, like `wo_site_check`: a page's numbers are the same whoever
-- searches. `stat_key` is `<network>:<id>` from the plugin's `parseSocialUrl` (handle, page slug, page
-- id or channel id, lower-cased where the network folds case). The row IS the queue
-- (`opportunities/durable-queue.js`: lease, fenced token, attempts); `opportunities/social-stats.js`
-- is the only writer.
--
-- A successful snapshot (followers … fetched_at, provider) stays when a later attempt fails (council
-- P1-6): a failure writes only status / last_attempt_at / last_error / next_retry_at. "Stale" is
-- derived at read time (fetched_at older than 7 days), never stored.
--
--   status          queued (waiting, leased, or deferred until next_retry_at by a spent daily budget)
--                   · done · not_found (no such profile, or private; kept 30 days) · failed (retried
--                   after next_retry_at)
--   requested_by    the account whose daily budget the next attempt is charged to (last requester)
--   coverage        complete | partial: posts_per_month counts only the posts the provider returned
--   last_error      the SocialStatsError code of the last failed attempt (rate_limited, schema_error…)
--   next_retry_at   when a queued row may be claimed again, or a failed one asked again
create table if not exists wo_social_stat (
  stat_key text primary key,
  network text not null check (network in ('facebook', 'instagram', 'tiktok', 'youtube')),
  url text not null,
  status text not null check (status in ('queued', 'done', 'not_found', 'failed')),
  requested_by uuid,
  platform_id text,
  handle text,
  followers bigint,
  posts bigint,
  last_post_at timestamptz,
  posts_per_month numeric,
  coverage text check (coverage in ('complete', 'partial')),
  provider text,
  fetched_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  next_retry_at timestamptz,
  error text,
  queued_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token bigint not null default 0,
  attempts integer not null default 0,
  checked_at timestamptz
);
create index if not exists wo_social_stat_queued on wo_social_stat (queued_at) where status = 'queued';

-- The RapidAPI application key (one key for every listing), sealed like the other provider keys.
alter table wo_ops_setting add column if not exists rapidapi_key_cipher text;
