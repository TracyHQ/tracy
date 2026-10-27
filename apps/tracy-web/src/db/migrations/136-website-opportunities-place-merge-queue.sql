-- apps/tracy-web/src/db/migrations/136-website-opportunities-place-merge-queue.sql
-- The operator's side of the shared place store (`/ops/wo` › Places, tasks/todo-wo-shared-research.md P4):
--
-- wo_place_merge_candidate  a pasted-URL place that may be the same restaurant as a Google place. The
--                           backfill (P3.5) queues the ambiguous pairs; an operator approves (the URL
--                           place is merged into the Google one, `lib/wo-places-store.js mergePlaces`) or
--                           rejects. One row per pair; a decided row is never reopened by a re-run.
-- wo_place_ops_event        what an operator did to a place: refresh, revoke, unrevoke, merge, split,
--                           approve, reject. Who, when, and the detail needed to undo it (a merge
--                           records the opportunities it moved, so a split can move them back).
--
-- Expand-only. An older image ignores both tables.
create table if not exists wo_place_merge_candidate (
  id uuid primary key default gen_random_uuid(),
  url_place_id uuid not null references wo_place(id),
  google_place_id uuid not null references wo_place(id),
  -- what matched: {website, phone, address, name} each with the compared values
  evidence jsonb not null default '{}'::jsonb,
  score real not null default 0,
  state text not null default 'pending' check (state in ('pending', 'approved', 'rejected')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (url_place_id, google_place_id),
  check (url_place_id <> google_place_id)
);
create index if not exists wo_place_merge_candidate_pending on wo_place_merge_candidate (created_at desc)
  where state = 'pending';

create table if not exists wo_place_ops_event (
  id bigserial primary key,
  place_id uuid not null references wo_place(id),
  action text not null
    check (action in ('refresh', 'revoke', 'unrevoke', 'merge', 'split', 'approve-merge', 'reject-merge')),
  actor text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wo_place_ops_event_place on wo_place_ops_event (place_id, created_at desc);
