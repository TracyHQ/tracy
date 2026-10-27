-- WHO PRESSED UNDO/RESTORE, AND WHAT ACTUALLY HAPPENED (plan §4.2, contract §2 — Site changes V2).
--
-- One row per undo/reset a person asked Tracy to run on a site's webroot. Before this table the
-- press lived only in `audit` (action=site.restore) and the resulting commit only in Git, so the
-- tab could not say who pressed, and a timeout looked like "nothing changed" even when the host
-- had finished (P0 report §4). DB and Git share no transaction: the row is created `pending`
-- BEFORE the host job starts, the job id is attached, and the row is completed from the job's
-- verified result — never from the absence of an HTTP response.
--
--   status    pending → succeeded (verified new head) · succeeded_noop (host ran, no new commit:
--             scope unchanged, NOT marked undone) · failed (host refused/errored cleanly) ·
--             unknown (lost contact; reconciled later through the job row).
--   idem_key  client-sent idempotency key, scoped to the site: a retry of the same press finds
--             this row instead of running the undo twice.
--   resulting_sha  the verified restore commit (full sha, author/subject checked per contract D2).
--             Unique per site so the Git commit and the operation count as ONE event
--             (`accountedForGit`), and a second completion cannot claim the same commit.
--   provenance  `live` rows are written by the door; `backfill-audit` rows are the one-off tool
--             joining old `audit` rows by site + detail.head (contract §5) — `source_ref` keeps
--             the audit id for provenance and is never sent to a client.
create table if not exists site_operation (
  id            uuid primary key default gen_random_uuid(),
  site_key      text not null,
  -- `undo` (one moment) · `reset` (back to a release/moment)
  action        text not null,
  -- Full sha of the target moment/release commit, resolved server-side at confirm time.
  target_sha    text,
  -- Read-only snapshot of what the press was told it would touch: `{files, complete, truncatedList}`
  -- from the same computation as restore_undo. The execution re-checks conflicts regardless.
  scope         jsonb,
  -- Verified email of the authenticated presser (historical identity, kept as it was).
  actor_email   text,
  status        text not null default 'pending',
  idem_key      text,
  -- The tracy `job` row that ran it (old hosts accept no new fields, so the job is the link).
  job_id        text,
  resulting_sha text,
  error         text,
  provenance    text not null default 'live',
  source_ref    text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists site_operation_site_created on site_operation (site_key, created_at desc);
create unique index if not exists site_operation_idem
  on site_operation (site_key, idem_key) where idem_key is not null;
create unique index if not exists site_operation_result
  on site_operation (site_key, resulting_sha) where resulting_sha is not null;
-- Backfill restarts must not duplicate rows: one operation per audit row.
create unique index if not exists site_operation_source_ref
  on site_operation (source_ref) where source_ref is not null;
