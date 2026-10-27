-- Read-image assignment shares the existing sealed provider book. No automatic reassignment.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial'));
alter table llm_assignment add column reasoning_effort text
  check (reasoning_effort is null or (door='woEditorial' and length(reasoning_effort) between 1 and 40));

-- Paid pixel tests are independent of a WO opportunity or site revision.
create table llm_model_test (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id),
  actor text not null,
  request_key uuid not null,
  fingerprint text not null,
  config jsonb not null,
  input jsonb not null,
  input_hash text not null,
  state text not null default 'pending'
    check (state in ('pending','running','succeeded','failed','uncertain')),
  fence integer not null default 1,
  lease_until timestamptz not null,
  reservation_id uuid references wo_cost_ledger(id),
  result jsonb,
  receipt jsonb,
  error text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  unique (account_id,request_key)
);
create index llm_model_test_proof on llm_model_test(fingerprint,completed_at desc)
  where state='succeeded';
