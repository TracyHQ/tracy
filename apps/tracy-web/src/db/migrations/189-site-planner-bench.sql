-- The site planner trial bench (ADR 0041, #301): one row per bench run, one per round, one per model call. Apart from
-- the WO quality tables: a bench run builds no site, belongs to no account and may run the same brief any number of
-- times.

-- One bench run. The row is also the durable queue's row (website-opportunities/src/durable-queue.js): `status` stays
-- 'queued' while the run waits or a worker holds its lease, and becomes the verdict; `step` and `round` say what it
-- is doing, for the bench CLI's `status`. The inputs (brief as used, kit, prompt hash, checker version, door snapshot, harness
-- settings) are frozen once stored, so a run always says exactly what it ran.
create table if not exists site_planner_run (
  id uuid primary key default gen_random_uuid(),
  started_by text not null,
  brief jsonb not null,
  brief_source jsonb not null,
  brief_sha256 text not null check (brief_sha256 ~ '^[0-9a-f]{64}$'),
  kit jsonb not null,
  prompt_sha256 text not null check (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  checker_version text not null check (length(checker_version) between 1 and 80),
  door jsonb not null,
  harness jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'succeeded', 'failed', 'cancelled')),
  error text,
  queued_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token bigint not null default 0,
  attempts integer not null default 0,
  checked_at timestamptz,
  step text not null default 'waiting' check (step in ('waiting', 'planning', 'checking', 'fixing', 'done')),
  round integer not null default 0 check (round between 0 and 2),
  cancel_requested_at timestamptz,
  -- The provider's own cost of every answered call, in USD, added as each call is saved.
  cost_usd numeric(16, 9) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- One active run at a time, across every process: a second queued row is refused by the database itself.
create unique index if not exists site_planner_run_one_active on site_planner_run ((true)) where status = 'queued';
create index if not exists site_planner_run_recent on site_planner_run (created_at desc);

create or replace function freeze_site_planner_run_input() returns trigger language plpgsql as $$
begin
  if (new.id, new.started_by, new.brief, new.brief_source, new.brief_sha256, new.kit, new.prompt_sha256,
      new.checker_version, new.door, new.harness)
     is distinct from
     (old.id, old.started_by, old.brief, old.brief_source, old.brief_sha256, old.kit, old.prompt_sha256,
      old.checker_version, old.door, old.harness) then
    raise exception 'site planner run input is immutable';
  end if;
  return new;
end $$;
drop trigger if exists site_planner_run_input_frozen on site_planner_run;
create trigger site_planner_run_input_frozen before update on site_planner_run
  for each row execute function freeze_site_planner_run_input();

-- One round of a run: round 0 is the first plan, rounds 1 and 2 the fix rounds. `answer` is the planner's final text
-- as given, `plan` the JSON parsed from it (null when it is not JSON), `failure_list` the checker's failure list sent
-- back to the planner for the next round.
create table if not exists site_planner_round (
  run_id uuid not null references site_planner_run(id) on delete cascade,
  round integer not null check (round between 0 and 2),
  state text not null default 'planning' check (state in ('planning', 'checked', 'failed', 'cancelled')),
  answer text,
  plan jsonb,
  check_result jsonb,
  failure_list text,
  cost_usd numeric(16, 9) not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (run_id, round)
);

-- One model call, append-only: inserted as 'dispatched' before the call goes out, then finished once as 'answered',
-- 'refused' (the provider's content filter) or 'failed'. A dispatched row with no answer is the proof that a call may
-- have been charged: a resumed run marks it abandoned and sends its request once more as a new turn, and a resend
-- lost again ends the run (190-site-planner-fix-rounds.sql). `sent` is what the call added to the conversation (the
-- first user message, the tool results, or a fix round's failure list; an opened kit image is kept as a reference to
-- the image cache, never as bytes), `request` a summary of the request, `message` the assistant's answer with its
-- reasoning details.
create table if not exists site_planner_turn (
  run_id uuid not null references site_planner_run(id) on delete cascade,
  n integer not null check (n >= 0),
  round integer not null check (round between 0 and 2),
  state text not null check (state in ('dispatched', 'answered', 'refused', 'failed')),
  request jsonb not null,
  sent jsonb not null,
  message jsonb,
  finish_reason text,
  generation_id text,
  provider_model text,
  refusal text,
  error jsonb,
  usage jsonb,
  cost_usd numeric(16, 9),
  dispatched_at timestamptz not null,
  answered_at timestamptz,
  primary key (run_id, n)
);

create or replace function site_planner_turn_append_only() returns trigger language plpgsql as $$
begin
  if old.state <> 'dispatched' then
    raise exception 'site planner turn % of run % is final', old.n, old.run_id;
  end if;
  if (new.run_id, new.n, new.round, new.request, new.sent, new.dispatched_at)
     is distinct from (old.run_id, old.n, old.round, old.request, old.sent, old.dispatched_at) then
    raise exception 'site planner turn % of run % keeps what was sent', old.n, old.run_id;
  end if;
  return new;
end $$;
drop trigger if exists site_planner_turn_append_only on site_planner_turn;
create trigger site_planner_turn_append_only before update on site_planner_turn
  for each row execute function site_planner_turn_append_only();
