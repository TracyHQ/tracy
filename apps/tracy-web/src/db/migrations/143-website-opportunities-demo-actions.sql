-- Accepted demo-build actions, separate from the site build's retryable identity. Expand-only.
create table if not exists wo_demo_usage (
  account_id uuid not null references account(id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (account_id, day)
);

create table if not exists wo_demo_action (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
  request_id text not null,
  fingerprint text not null,
  accepted_at timestamptz not null,
  revision_id uuid not null,
  build_request_id text not null,
  session_id text not null,
  automatic boolean not null default true,
  retry_of uuid references wo_demo_action(id),
  label text not null default '',
  status text not null default 'queued',
  step text not null default 'brief',
  error text,
  queued_at timestamptz not null,
  next_at timestamptz,
  lease_until timestamptz,
  lease_token bigint not null default 0,
  attempts integer not null default 0,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (account_id, request_id)
);
create index if not exists wo_demo_action_queue on wo_demo_action (next_at, queued_at) where status = 'queued';
create index if not exists wo_demo_action_opportunity on wo_demo_action (opportunity_id, accepted_at desc);

-- A stale QA runner cannot save over a later round, including after a worker restart.
alter table wo_build add column if not exists qa_lease_token bigint not null default 0;
