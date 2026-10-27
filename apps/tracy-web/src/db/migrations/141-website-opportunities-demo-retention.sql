-- apps/tracy-web/src/db/migrations/141-website-opportunities-demo-retention.sql
-- The life of a Website Opportunities demo site (`opportunities/demo-retention.js`,
-- tasks/todo-wo-demo-retention.md): an unused demo is frozen, then deleted through the site's own
-- teardown. The brief, QA result, screenshots and cost ledger are kept; only the site goes.
--
--   demo_expires_at  when the demo freezes; set once the build has a site, pushed out by every touch,
--                    null = kept for good (the owner took the site)
--   demo_touched_at  the last open of the detail page, hand-off or QA round
--   demo_frozen_at   frozen (a reopen clears it); the delete counts its grace from here
--   demo_deleted_at  the site was torn down; the row stays as the record
-- Expand-only: an older image never reads these columns.
alter table wo_build add column if not exists demo_expires_at timestamptz;
alter table wo_build add column if not exists demo_touched_at timestamptz;
alter table wo_build add column if not exists demo_frozen_at timestamptz;
alter table wo_build add column if not exists demo_deleted_at timestamptz;

create index if not exists wo_build_demo_expiry on wo_build (demo_expires_at) where demo_deleted_at is null;

-- Demos built before this file get the default 14 days from now, not an instant freeze.
update wo_build set demo_expires_at = now() + interval '14 days'
 where site_key is not null and demo_expires_at is null and demo_deleted_at is null;
