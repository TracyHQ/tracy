-- Discovery receipts outlive a failed import and never contain credentials.
create table wo_prefetch_source_batch (
  source_key text primary key check(source_key='dubai-google-v1'),
  id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table wo_prefetch_source_page (
  source_key text not null references wo_prefetch_source_batch(source_key),
  page integer not null check(page between 0 and 2),
  request_hash text not null,
  state text not null default 'planned' check(state in ('planned','starting','received')),
  reservation_id uuid references wo_cost_ledger(id),
  http_status integer,
  response jsonb,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(source_key,page)
);
