-- Editorial inputs and provider attempts outlive both the worker and its temporary directory.
create table if not exists wo_quality_run (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  opportunity_id uuid not null,
  revision_id uuid not null,
  action_id uuid,
  parent_run_id uuid references wo_quality_run(id),
  input_hash text not null,
  input jsonb not null,
  policy jsonb not null,
  state text not null default 'pending'
    check (state in ('pending','running','succeeded','failed','cancelled','uncertain','needs-attention')),
  artifacts jsonb not null default '{}',
  repair_count integer not null default 0 check (repair_count between 0 and 2),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, revision_id)
);
create or replace function freeze_wo_quality_input() returns trigger language plpgsql as $$
begin
  if (new.account_id, new.opportunity_id, new.revision_id, new.action_id, new.parent_run_id,
      new.input_hash, new.input, new.policy)
     is distinct from
     (old.account_id, old.opportunity_id, old.revision_id, old.action_id, old.parent_run_id,
      old.input_hash, old.input, old.policy) then
    raise exception 'WO quality input is immutable';
  end if;
  return new;
end $$;
drop trigger if exists wo_quality_input_frozen on wo_quality_run;
create trigger wo_quality_input_frozen before update on wo_quality_run
  for each row execute function freeze_wo_quality_input();

alter table wo_cost_ledger add column if not exists account_id uuid;
alter table wo_cost_ledger add column if not exists action_id uuid;
alter table wo_cost_ledger add column if not exists build_id uuid;
create index if not exists wo_cost_ledger_account_day on wo_cost_ledger(account_id,budget_day)
  where account_id is not null;

create table if not exists wo_quality_attempt (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references wo_quality_run(id),
  stage text not null,
  input_hash text not null,
  input jsonb not null,
  model_config jsonb not null,
  state text not null default 'pending'
    check (state in ('pending','running','succeeded','failed','cancelled','uncertain')),
  lease_token bigint not null default 0,
  lease_until timestamptz,
  reservation_id uuid references wo_cost_ledger(id),
  result jsonb,
  receipt jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,stage,input_hash)
);
create index if not exists wo_quality_attempt_open on wo_quality_attempt(state,lease_until)
  where state in ('pending','running');

-- Operation intent is durable BEFORE a request can reach the CMS. It is not a CMS transaction.
create table if not exists wo_quality_operation (
  id text primary key,
  run_id uuid not null references wo_quality_run(id),
  account_id uuid not null,
  build_id uuid not null,
  site_key text not null,
  plan_hash text not null,
  operation jsonb not null,
  before_image jsonb not null,
  after_image jsonb not null,
  state text not null default 'pending',
  receipt jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
