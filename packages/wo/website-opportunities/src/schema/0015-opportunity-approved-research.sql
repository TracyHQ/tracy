-- An approved card keeps the research it was approved with (#537 R23): the cards of one place share its research
-- (`wo_place_snapshot`), and another card's research publishes a new snapshot or carries its tries onto the current
-- one, so a card's approval pins what it read (`approved-research.js`).
-- snapshot_id    the published place snapshot the card read when its Business facts were approved; its profile and
--                photos are immutable once published (`0004-place-snapshot-guard.sql`).
-- sources        that snapshot's source rows as they read then: their scheduling facts (collected_at, coverage,
--                last_error) may still move on the shared row.
-- google_ids     the place's Google ids then, which decide whether a search seed is this place's.
-- identity       the place's external id then (`{namespace, external_id}`, or null), named by its place profile.
-- social_stats   the social stats cache's measurements then, by stat key (`place-social-stats.js`); null until read.
-- approved_at    the `profile_approved_at` it was taken for: an approval cleared and given again takes a new one.
-- Expand-only: an older image never reads it, and a card approved before this file is pinned on its next read.
create table if not exists wo_opportunity_approved_research (
  opportunity_id uuid primary key references wo_opportunity (id) on delete cascade,
  approved_at timestamptz not null,
  snapshot_id uuid not null,
  sources jsonb not null default '[]'::jsonb,
  google_ids jsonb not null default '[]'::jsonb,
  identity jsonb,
  social_stats jsonb,
  created_at timestamptz not null default now()
);
