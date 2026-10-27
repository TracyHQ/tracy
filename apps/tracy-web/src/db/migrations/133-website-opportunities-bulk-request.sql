-- apps/tracy-web/src/db/migrations/133-website-opportunities-bulk-request.sql
-- One row per press of a bulk Resume/Cancel on My opportunities (`POST /api/website-opportunities/
-- jobs/bulk`, tasks/todo-wo-my-opportunities-v2.md D4 as amended 19/10). The client names the press
-- (`request_id`) and sends it again after a lost answer; the door then answers `result` instead of
-- running the jobs a second time.
--
-- A table, not a key on `wo_job`: one press touches up to 500 jobs, and the answer it gave (which
-- were done, skipped, failed) is a fact of the press, not of any one job. A row in Postgres, not in
-- process memory, so a replay that reaches another web instance or a restarted one answers the same.
--
--   request_hash  sha256 of the action and selection; the same id with another body is refused
--   result        null while the press runs (a second send answers BULK_PENDING); a row left null by
--                 a process that died is taken over after 10 minutes
-- Expand-only: an older image never reads it.
create table if not exists wo_bulk_request (
  account_id uuid not null references account(id) on delete cascade,
  request_id text not null,
  action text not null check (action in ('resume', 'cancel')),
  request_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, request_id)
);
