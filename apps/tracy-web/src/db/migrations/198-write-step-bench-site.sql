-- The write step bench's site record (ADR 0044): one row per trial site the bench creator made, so it deletes only
-- sites it made itself and keeps at most one. A row is written before the site is asked for, so a crash leaves a
-- trace. Removing the bench removes this one table. It holds no key and no customer data.
create table if not exists write_bench_site (
  id uuid primary key default gen_random_uuid(),
  label text not null check (label ~ '^write-bench-[a-z0-9]{3,12}$'),
  quickstart text not null,
  contract text not null,
  started_by text not null,
  status text not null default 'creating' check (status in ('creating', 'ready', 'failed', 'removed')),
  site_key text,
  job_id text,
  code text,
  reason text,
  create_ms integer,
  total_ms integer,
  answered_contract text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists write_bench_site_status_idx on write_bench_site (status, created_at desc);

-- One row per write step run, on a site the table above names. The run happens in the bench command's own process, so
-- this row is how another shell reads it or asks it to stop: `cancel_requested_at` is checked between phases. One run at a
-- time per site. Its report holds the customer's words of the trial, so removing the bench removes this table too.
create table if not exists write_bench_run (
  id uuid primary key default gen_random_uuid(),
  site_key text not null,
  kit text not null,
  started_by text not null,
  status text not null default 'running' check (status in ('running', 'done', 'stopped', 'cancelled')),
  phase text not null default 'waiting',
  cancel_requested_at timestamptz,
  code text,
  reason text,
  report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists write_bench_run_one_active on write_bench_run (site_key) where status = 'running';
create index if not exists write_bench_run_created_idx on write_bench_run (created_at desc);
