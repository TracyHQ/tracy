-- The brand trial bench (brand step trial bench, #320): one row per run, one per round, one per model call. Apart from
-- the site planner bench and the WO quality tables: a brand run builds no site, belongs to no account and may run the
-- same brief any number of times. Removing the bench removes only these three tables.

-- One brand run. The row is also the durable queue's row (website-opportunities/src/durable-queue.js): `status` stays
-- 'queued' while the run waits or a worker holds its lease, and becomes the verdict; `step` and `round` say what it is
-- doing, for the bench CLI's `status`. The inputs (brief as used, kit, prompt hash, door snapshots, harness settings)
-- are frozen once stored, so a run always says exactly what it ran. Never a key.
create table if not exists brand_run (
  id uuid primary key default gen_random_uuid(),
  started_by text not null,
  brief jsonb not null,
  brief_source jsonb not null,
  brief_sha256 text not null check (brief_sha256 ~ '^[0-9a-f]{64}$'),
  kit jsonb not null,
  prompt_sha256 text not null check (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  -- Both doors as the run was started on them (provider, model, revisions; the agent's one-off override and its reason).
  door jsonb not null,
  -- Tool names and versions the run was started with.
  tools jsonb not null,
  -- Cache window, image size, output budget, effort, cost cap and the rest of the harness.
  harness jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'succeeded', 'failed', 'cancelled')),
  error text,
  queued_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token bigint not null default 0,
  attempts integer not null default 0,
  checked_at timestamptz,
  step text not null default 'waiting'
    check (step in ('waiting', 'working', 'gate', 'fixing', 'safe-version', 'real-page-check', 'done')),
  round integer not null default 0 check (round between 0 and 2),
  cancel_requested_at timestamptz,
  -- How the run ended: the agent's brand file, or the safe version built by code (and why).
  outcome text check (outcome in ('brand-file', 'safe-version')),
  safe_version_reason text check (safe_version_reason in ('gate', 'cost-cap')),
  -- The brand file the run ended with (the accepted one, or the safe version).
  brand_file jsonb,
  -- The real-page check's verdict (a later ticket writes it); null until then.
  real_page_verdict jsonb,
  -- The provider's own cost of every answered call, in USD, split by what it paid for.
  cost_agent_usd numeric(16, 9) not null default 0,
  cost_drawing_usd numeric(16, 9) not null default 0,
  cost_reviewer_usd numeric(16, 9) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- One active run at a time, across every process: a second queued row is refused by the database itself.
create unique index if not exists brand_run_one_active on brand_run ((true)) where status = 'queued';
create index if not exists brand_run_recent on brand_run (created_at desc);

create or replace function freeze_brand_run_input() returns trigger language plpgsql as $$
begin
  if (new.id, new.started_by, new.brief, new.brief_source, new.brief_sha256, new.kit, new.prompt_sha256,
      new.door, new.tools, new.harness)
     is distinct from
     (old.id, old.started_by, old.brief, old.brief_source, old.brief_sha256, old.kit, old.prompt_sha256,
      old.door, old.tools, old.harness) then
    raise exception 'brand run input is immutable';
  end if;
  return new;
end $$;
drop trigger if exists brand_run_input_frozen on brand_run;
create trigger brand_run_input_frozen before update on brand_run
  for each row execute function freeze_brand_run_input();

-- One round of a run: round 0 is the first brand file, rounds 1 and 2 the fix rounds. `attempt` is the brand file the
-- agent saved this round, `gate_result` the gate's verdict on it, `sent_back` the rejected fields (only those) that
-- went back as the next user turn, `fault` whom the rejection is blamed on: the agent, or the gate (a gate that
-- rejects its own correct output is a bug to fix in the gate).
create table if not exists brand_round (
  run_id uuid not null references brand_run(id) on delete cascade,
  round integer not null check (round between 0 and 2),
  state text not null default 'working' check (state in ('working', 'accepted', 'rejected', 'failed', 'cancelled')),
  attempt jsonb,
  answer text,
  gate_result jsonb,
  sent_back jsonb,
  fault text check (fault in ('agent', 'gate')),
  cost_usd numeric(16, 9) not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (run_id, round)
);

-- One model call, append-only in spirit: the agent's turns (kind 'agent', inserted as 'dispatched' before the call
-- goes out, finished once as 'answered', 'refused' or 'failed'; a dispatched row with no answer is the proof that a
-- call may have been charged, so a resumed run never sends it again: it fails with the reason),
-- and the drawing and reviewer calls the tools make (kind 'drawing' or 'reviewer', one row each, written when the
-- call ends). `tool`, `model`, `purpose`, `status`, `latency_ms` and `cost_usd` are on every row; never a key, never
-- image bytes (an image is a reference).
create table if not exists brand_call (
  id bigint generated always as identity primary key,
  run_id uuid not null references brand_run(id) on delete cascade,
  kind text not null check (kind in ('agent', 'drawing', 'reviewer')),
  -- The agent turn number (agent rows only); drawing and reviewer rows have none.
  n integer check (n is null or n >= 0),
  round integer not null check (round between 0 and 2),
  tool text,
  model text,
  purpose text not null,
  state text not null check (state in ('dispatched', 'answered', 'refused', 'failed')),
  request jsonb not null default '{}'::jsonb,
  sent jsonb not null default '[]'::jsonb,
  message jsonb,
  finish_reason text,
  generation_id text,
  provider_model text,
  refusal text,
  error jsonb,
  usage jsonb,
  cost_usd numeric(16, 9),
  retries jsonb,
  progress jsonb,
  resend_of integer,
  latency_ms integer,
  dispatched_at timestamptz not null default now(),
  answered_at timestamptz
);
create unique index if not exists brand_call_agent_turn on brand_call (run_id, n) where kind = 'agent';
create index if not exists brand_call_run on brand_call (run_id, id);

create or replace function brand_call_append_only() returns trigger language plpgsql as $$
begin
  if old.state not in ('dispatched') then
    raise exception 'brand call % of run % is final', old.id, old.run_id;
  end if;
  if (new.run_id, new.kind, new.n, new.round, new.request, new.sent, new.dispatched_at)
     is distinct from (old.run_id, old.kind, old.n, old.round, old.request, old.sent, old.dispatched_at) then
    raise exception 'brand call % of run % keeps what was sent', old.id, old.run_id;
  end if;
  return new;
end $$;
drop trigger if exists brand_call_append_only on brand_call;
create trigger brand_call_append_only before update on brand_call
  for each row execute function brand_call_append_only();
