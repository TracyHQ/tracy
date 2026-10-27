-- apps/tracy-web/src/db/migrations/138-website-opportunities-place-backfill-website.sql
-- The backfill's website pass (tasks/todo-wo-shared-research.md P3, `opportunities/place-backfill.js`):
-- research made before P1 kept Google Place Details without `websiteUri`, so nothing it collected could be
-- vouched for and it stayed the account's own. One pass per Google place asks Google for the website once
-- (charged through `wo_cost_ledger`), then verifies the links from what the account ALREADY collected and
-- publishes a new snapshot of the place when something new became shareable.
--
-- website_pass        null = not looked at; `waiting` = left for a later pass (the research cap was
--                     reached, Google failed, a picture copy failed); `done` = finished, whatever the
--                     outcome (`website_detail` says which).
-- website_pass_at     when the pass last looked: a waiting place is tried again after the retry delay.
-- website_attempts    failed tries (a Google error or a picture copy); the pass gives up after a few.
-- google_website      the website Google's record of the place names (null: it names none).
-- google_website_at   when Google answered: once set, Google is never asked again for this place.
--
-- Expand-only. An older image ignores the new columns.
alter table wo_place_backfill add column if not exists website_pass text
  check (website_pass in ('waiting', 'done'));
alter table wo_place_backfill add column if not exists website_pass_at timestamptz;
alter table wo_place_backfill add column if not exists website_attempts integer not null default 0;
alter table wo_place_backfill add column if not exists website_detail jsonb not null default '{}'::jsonb;
alter table wo_place_backfill add column if not exists google_website text;
alter table wo_place_backfill add column if not exists google_website_at timestamptz;
create index if not exists wo_place_backfill_website_pass on wo_place_backfill (place_id)
  where state in ('done', 'skipped') and (website_pass is null or website_pass = 'waiting');
