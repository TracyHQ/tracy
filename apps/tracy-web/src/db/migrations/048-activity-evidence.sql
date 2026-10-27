-- EVIDENCE COLUMNS FOR SITE CHANGES V2 (plan tasks/todo-site-changes-v2.md §4.2, contract §2).
--
-- V2 shows four columns (Description · Time · Source · By) and must say where each claim comes
-- from. These are nullable additions only: V1 rows stay readable, old writers keep working, and
-- null always means "recorded before this column existed", never a new meaning for old data.
--
-- 🔒 Schema only. No backfill, no scan, no index on `audit` (023-site-write-lease.sql: migrations
-- run in one transaction before the server listens).

-- Whether the stored `title` is the person's full request. Set by the write door from V2 on:
-- `full` (stored whole) or `truncated` (the door cut it and says so). Null: legacy rows — length
-- 200 is only a heuristic, so V2 shows "Full original request unavailable" instead of guessing.
alter table site_turn add column if not exists request_state text;

-- What produced a CMS log row, when the producer proves it: `{schema, version, hash, context?}`
-- as the collector's adapter reported it. V1 rows carry no per-row producer, so the WordPress
-- cron contract for them rests on the hook's Git history alone (P0 report §3); from now on the
-- row itself carries the proof.
alter table site_cms_change add column if not exists producer jsonb;

-- The CMS log's own event type (the WordPress adapter reads `type` but the mapper dropped it).
-- Kept verbatim from the source log; the V2 classifier maps it, never rewrites it.
alter table site_cms_change add column if not exists change_type text;
