-- The timer that keeps the warm pools full: how often it runs, and what its last run did.
--
-- 🔒 A PERIOD IN CODE IS A PERIOD NOBODY CAN SEE. `RECONCILE_MS` was a constant in
-- `inventory/reconcile.js`, so the only way to learn how often stock was topped up was to read the
-- source, and the only way to know the timer was alive at all was to watch instances appear. This
-- row makes both answerable from /ops: the period an operator chose, and when the pass last began,
-- last ended, and whether it threw.
--
-- ONE ROW, NOT ONE PER REPLICA. The pass runs under an advisory lock (`LOCK_ID = 7_243_003`), so at
-- most one replica does the work per tick and "the last run" is a fact about the deployment, not
-- about a process. Every replica reads the same period, so changing it here reaches all of them on
-- their next tick without a restart.
--
-- No seed row, same as `badge_setting`: a missing row reads as the default in code (revision 0),
-- and the first save or the first recorded run inserts it.
create table inventory_sweep (
  id boolean primary key default true check (id),
  -- Ten seconds to an hour. Below ten, the counting queries run faster than a host can answer the
  -- previous tick's calls; above an hour, a pool emptied by a burst of signups stays empty for
  -- longer than anyone would wait before calling it broken.
  period_ms integer not null default 30000 check (period_ms between 10000 and 3600000),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  -- Null after a run that finished cleanly. The message only — never a stack, never a key.
  last_error text,
  -- What the four passes reported: advanced, retired, enqueued, started. jsonb because the passes
  -- own their own counts and a column per count would be a migration per new pass.
  last_outcome jsonb,
  revision integer not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);
