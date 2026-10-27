-- apps/tracy-web/src/db/migrations/137-website-opportunities-place-backfill.sql
-- Moving per-account research into the shared place store, and merging a pasted-URL place into the
-- Google place it is (tasks/todo-wo-shared-research.md P3, `opportunities/place-backfill.js`,
-- `opportunities/place-merge.js`).
--
-- wo_place_backfill        one row per place the backfill looked at: `done` (a snapshot was published
--                          from an account's research; which one is the provenance), `skipped` (that
--                          research named nothing the place may share: every source was the account's
--                          own), `retry` (a media copy failed; tried again next pass, `attempts` counts).
--                          A done or skipped place is never looked at again, so a re-run is a no-op.
-- wo_place_media_legacy    which `wo_media` row (and object key) a backfilled place media row was copied
--                          from. The old object is never deleted: revisions made before keep reading it.
-- wo_place_merge_candidate.applied_at  an approved merge waits for both places to be idle (no queued or
--                          running place job); the sweep applies it and stamps this. `apply_error` says
--                          why an approved merge could not be applied (one place merged elsewhere since).
--
-- Expand-only. An older image ignores the new table and columns.
create table if not exists wo_place_backfill (
  place_id uuid primary key references wo_place(id),
  state text not null check (state in ('done', 'skipped', 'retry')),
  snapshot_id uuid references wo_place_snapshot(id),
  from_opportunity_id uuid references wo_opportunity(id) on delete set null,
  from_account_id uuid,
  from_job_id uuid,
  attempts integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wo_place_media_legacy (
  wo_media_id uuid primary key references wo_media(id) on delete cascade,
  place_media_id uuid not null references wo_place_media(id),
  old_object_key text,
  created_at timestamptz not null default now()
);
create index if not exists wo_place_media_legacy_place_media on wo_place_media_legacy (place_media_id);

alter table wo_place_merge_candidate add column if not exists applied_at timestamptz;
alter table wo_place_merge_candidate add column if not exists apply_error text;
create index if not exists wo_place_merge_candidate_unapplied on wo_place_merge_candidate (decided_at)
  where state = 'approved' and applied_at is null and apply_error is null;
