-- apps/tracy-web/src/db/migrations/135-website-opportunities-cost-ledger.sql
-- What Tracy pays for shared research (tasks/todo-wo-shared-research.md P2): every billable provider
-- call (Apify actor runs, Google Place Details and Photos, PageSpeed, the vision model) is RESERVED
-- here before it goes out and settled after (`opportunities/cost-ledger.js`, the only writer). Tracy
-- pays, not the account: the caps are deployment-wide (`/ops/wo` › researchDailyCapCents) and per
-- research job (researchJobCapCents). A reservation is admitted only while
-- spent + held + its ceiling <= the cap, under one transaction-level advisory lock.
--
--   budget_day      the UTC day the call is charged to (from the caller's clock, not now())
--   place_id, opportunity_id, job_id
--                   plain uuids, NO foreign keys on purpose: the place/job tables of P1 (migration 134)
--                   may still be renamed or merged, and a ledger row must outlive a deleted job or a
--                   merged place — it is what Tracy was billed
--   provider, operation  e.g. apify / apify~facebook-posts-scraper, google / place-details
--   reserved_cents  the ceiling held before the call (price table `cost-prices.js`)
--   actual_cents    what the call cost, once known; a settled call without a known cost settles at its ceiling
--   state           reserved   held, the call may be in flight
--                   settled    the call happened, actual_cents is what counts
--                   released   the call provably never went out: counts nothing
--                   unreconciled  the call threw or the holder vanished: it may have been billed, so the
--                                 ceiling keeps counting until an operator (or a late settle) reconciles it.
--                                 Never released silently.
--   provider_run_id the provider's id of the run (Apify run id), for reconciliation
--   request_key     optional idempotency key: a replayed reserve with the same key returns the same row
create table if not exists wo_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  budget_day date not null,
  place_id uuid,
  opportunity_id uuid,
  job_id uuid,
  provider text not null,
  operation text not null,
  reserved_cents integer not null check (reserved_cents >= 0),
  actual_cents integer check (actual_cents >= 0),
  state text not null default 'reserved'
    check (state in ('reserved', 'settled', 'released', 'unreconciled')),
  provider_run_id text,
  request_key text unique,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
-- The day's sum, read under the lock on every reserve.
create index if not exists wo_cost_ledger_day on wo_cost_ledger (budget_day, state);
-- A place's cost per day (`/ops/wo` places, P4).
create index if not exists wo_cost_ledger_place_day on wo_cost_ledger (place_id, budget_day)
  where place_id is not null;
-- A job's sum for the per-job cap.
create index if not exists wo_cost_ledger_job on wo_cost_ledger (job_id) where job_id is not null;
-- Reservations still open, for the stale sweep.
create index if not exists wo_cost_ledger_open on wo_cost_ledger (created_at) where state = 'reserved';
