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
