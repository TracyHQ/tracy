-- A bench (the site planner, the site writer, the picture step, the brand step) holds up to BENCH_RUNS_AT_ONCE active
-- runs (apps/tracy-web/src/lib/bench-sql.js, #633), and its worker plays them side by side, each under a lease of its
-- own: two step chain builds started together no longer play their plan, copy, pictures and brand steps one after the
-- other. The one-active unique indexes allowed exactly one queued row, so they go. A start now counts the active runs
-- and inserts in one transaction under an advisory lock on the run table (insertRunWithinLimit), so two processes
-- starting at once still never pass the limit; the queue's claim keeps every lease to one worker (durable-queue.js).
drop index if exists site_planner_run_one_active;
drop index if exists site_writer_run_one_active;
drop index if exists site_picture_run_one_active;
drop index if exists brand_run_one_active;

-- The active runs, which the start counts, the worker claims and a chain build looks its own run up in.
create index if not exists site_planner_run_active on site_planner_run (queued_at) where status = 'queued';
create index if not exists site_writer_run_active on site_writer_run (queued_at) where status = 'queued';
create index if not exists site_picture_run_active on site_picture_run (queued_at) where status = 'queued';
create index if not exists brand_run_active on brand_run (queued_at) where status = 'queued';
