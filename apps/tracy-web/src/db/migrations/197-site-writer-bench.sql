-- The site writer trial bench (ADR 0042, #329): its model door and its own three tables, with the shape of the site
-- planner bench's (migrations 189 to 194, ADR 0042 section 6), so the shared bench run loop (lib/bench-run-loop.js)
-- runs it unchanged. Apart from the planner bench: a writer run builds no site, belongs to no account and may run the
-- same plan any number of times. Removing the bench removes only these three tables and the door name.

-- The writer's door. A door of its own, so the bench never borrows the planner's model; it takes no reasoning effort
-- (the bench fixes it in code: max on DeepSeek Flash, lib/bench-harness.js), so the effort check stays as it is.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter'));

-- One writer run, also the durable queue's row. The inputs (the site plan, the brief as used, kit, prompt hash,
-- checker version, door snapshot, harness settings) are frozen once stored, so a run always says exactly what it ran.
create table if not exists site_writer_run (
  id uuid primary key default gen_random_uuid(),
  started_by text not null,
  plan jsonb not null,
  plan_source jsonb not null,
  plan_sha256 text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
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
  -- The failures still standing when the run ended with no fix round left; null when the last copy was clean.
  standing_failures text,
  -- The provider balance before and after the run (lib/provider-balance.js); not an input, so not frozen.
  balance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- One active writer run at a time, across every process (planner runs are counted apart).
create unique index if not exists site_writer_run_one_active on site_writer_run ((true)) where status = 'queued';
create index if not exists site_writer_run_recent on site_writer_run (created_at desc);

create or replace function freeze_site_writer_run_input() returns trigger language plpgsql as $$
begin
  if (new.id, new.started_by, new.plan, new.plan_source, new.plan_sha256, new.brief, new.brief_source,
      new.brief_sha256, new.kit, new.prompt_sha256, new.checker_version, new.door, new.harness)
     is distinct from
     (old.id, old.started_by, old.plan, old.plan_source, old.plan_sha256, old.brief, old.brief_source,
      old.brief_sha256, old.kit, old.prompt_sha256, old.checker_version, old.door, old.harness) then
    raise exception 'site writer run input is immutable';
  end if;
  return new;
end $$;
drop trigger if exists site_writer_run_input_frozen on site_writer_run;
create trigger site_writer_run_input_frozen before update on site_writer_run
  for each row execute function freeze_site_writer_run_input();

-- One round: round 0 is the first copy, rounds 1 and 2 the fix rounds. `answer` is the writer's final text as given,
-- `copy` the site-copy/1 file put together from it (code adds version, fingerprint and the plan's label slots; a fix
-- round's corrected entries are applied to the previous round's copy), `changes` the corrected entries as applied,
-- `failure_list` the copy check's failure list sent back for the next round. The state words are the planner's.
create table if not exists site_writer_round (
  run_id uuid not null references site_writer_run(id) on delete cascade,
  round integer not null check (round between 0 and 2),
  state text not null default 'planning'
    check (state in ('planning', 'checked', 'not_a_plan', 'failed', 'cancelled')),
  answer text,
  copy jsonb,
  check_result jsonb,
  failure_list text,
  changes jsonb,
  reading jsonb,
  cost_usd numeric(16, 9) not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (run_id, round)
);

-- One model call, append-only: inserted as 'dispatched' before the call goes out, then finished once. A dispatched
-- row with no answer after a restart is marked 'abandoned' and its request sent once more as a new turn naming it in
-- `resend_of`. Same columns as site_planner_turn.
create table if not exists site_writer_turn (
  run_id uuid not null references site_writer_run(id) on delete cascade,
  n integer not null check (n >= 0),
  round integer not null check (round between 0 and 2),
  state text not null check (state in ('dispatched', 'answered', 'refused', 'failed', 'abandoned')),
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
  retries jsonb,
  progress jsonb,
  resend_of integer check (resend_of >= 0),
  dispatched_at timestamptz not null,
  answered_at timestamptz,
  primary key (run_id, n)
);

create or replace function site_writer_turn_append_only() returns trigger language plpgsql as $$
begin
  if old.state <> 'dispatched' then
    raise exception 'site writer turn % of run % is final', old.n, old.run_id;
  end if;
  if (new.run_id, new.n, new.round, new.request, new.sent, new.dispatched_at)
     is distinct from (old.run_id, old.n, old.round, old.request, old.sent, old.dispatched_at) then
    raise exception 'site writer turn % of run % keeps what was sent', old.n, old.run_id;
  end if;
  return new;
end $$;
drop trigger if exists site_writer_turn_append_only on site_writer_turn;
create trigger site_writer_turn_append_only before update on site_writer_turn
  for each row execute function site_writer_turn_append_only();
