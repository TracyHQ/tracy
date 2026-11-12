-- Where the seller's outreach to one business stands (`outreach-state.js`): the seller marks each step themselves through
-- `PUT /api/website-opportunities/:id/outreach/state`; nothing is sent for them and nothing is guessed.
-- sent_at     when the seller marked the outreach sent (the first time; marking it again keeps that time).
-- replied_at  when the seller marked that the business answered.
-- won_at      when the seller marked the deal won; lost_at when lost. At most one of the two is set.
-- updated_at  the last change of this row.
-- One row per opportunity, deleted with it. Private to the seller: never sent to a hub.
-- Expand-only: an older image never reads it.
create table if not exists wo_outreach (
  opportunity_id uuid primary key references wo_opportunity (id) on delete cascade,
  sent_at timestamptz,
  replied_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint wo_outreach_one_ending check (won_at is null or lost_at is null)
);
