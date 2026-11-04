-- The picture trial bench (ADR 0043, #340): its own run, round and turn tables with the shape of the site writer
-- bench's (migration 197), so the shared bench run loop (lib/bench-run-loop.js) runs it unchanged, plus one row per
-- picture file it wrote. Like the writer bench, a picture run builds no site, belongs to no account and may run the
-- same plan any number of times. Removing the bench removes only these four tables.
--
-- The first runs are code only (#340): no model door yet, so `door` is an empty object and no turn is written; the
-- picker, drawer and looker doors come with their tickets.

-- One picture run, also the durable queue's row. The inputs (the site plan, the brief as used, where its owner photos
-- come from, the kit, the prompt hashes, checker version, door snapshot, harness settings) are frozen once stored.
create table if not exists site_picture_run (
  id uuid primary key default gen_random_uuid(),
  started_by text not null,
  plan jsonb not null,
  plan_source jsonb not null,
  plan_sha256 text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  brief jsonb not null,
  brief_source jsonb not null,
  brief_sha256 text not null check (brief_sha256 ~ '^[0-9a-f]{64}$'),
  -- Where the owner photo bytes are read: the folder the CLI copied into the bench's file store, or the revision's
  -- stored media. Never a path on a machine.
  photo_source jsonb not null,
  kit jsonb not null,
  -- The hash of the three role prompts together, and each role's own hash.
  prompt_sha256 text not null check (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  prompts jsonb not null,
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
  -- The provider's own cost of every answered model call, in USD (none in a code only run).
  cost_usd numeric(16, 9) not null default 0,
  -- The picture check failures still standing when the run ended; null when the last manifest was clean.
  standing_failures text,
  -- The provider balance before and after the run (lib/provider-balance.js); null while no model door is read.
  balance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- One active picture run at a time, across every process (planner and writer runs are counted apart).
create unique index if not exists site_picture_run_one_active on site_picture_run ((true)) where status = 'queued';
create index if not exists site_picture_run_recent on site_picture_run (created_at desc);

create or replace function freeze_site_picture_run_input() returns trigger language plpgsql as $$
begin
  if (new.id, new.started_by, new.plan, new.plan_source, new.plan_sha256, new.brief, new.brief_source,
      new.brief_sha256, new.photo_source, new.kit, new.prompt_sha256, new.prompts, new.checker_version, new.door,
      new.harness)
     is distinct from
     (old.id, old.started_by, old.plan, old.plan_source, old.plan_sha256, old.brief, old.brief_source,
      old.brief_sha256, old.photo_source, old.kit, old.prompt_sha256, old.prompts, old.checker_version, old.door,
      old.harness) then
    raise exception 'site picture run input is immutable';
  end if;
  return new;
end $$;
drop trigger if exists site_picture_run_input_frozen on site_picture_run;
create trigger site_picture_run_input_frozen before update on site_picture_run
  for each row execute function freeze_site_picture_run_input();

-- One round: round 0 is the first manifest, rounds 1 and 2 the fix rounds (none in a code only run). `pictures` is the
-- site-pictures/1 manifest, `check_result` the picture check's result, `failure_list` its failure list.
create table if not exists site_picture_round (
  run_id uuid not null references site_picture_run(id) on delete cascade,
  round integer not null check (round between 0 and 2),
  state text not null default 'planning'
    check (state in ('planning', 'checked', 'not_a_plan', 'failed', 'cancelled')),
  answer text,
  pictures jsonb,
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

-- One model call, append-only, with the same columns and rules as site_writer_turn.
create table if not exists site_picture_turn (
  run_id uuid not null references site_picture_run(id) on delete cascade,
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

create or replace function site_picture_turn_append_only() returns trigger language plpgsql as $$
begin
  if old.state <> 'dispatched' then
    raise exception 'site picture turn % of run % is final', old.n, old.run_id;
  end if;
  if (new.run_id, new.n, new.round, new.request, new.sent, new.dispatched_at)
     is distinct from (old.run_id, old.n, old.round, old.request, old.sent, old.dispatched_at) then
    raise exception 'site picture turn % of run % keeps what was sent', old.n, old.run_id;
  end if;
  return new;
end $$;
drop trigger if exists site_picture_turn_append_only on site_picture_turn;
create trigger site_picture_turn_append_only before update on site_picture_turn
  for each row execute function site_picture_turn_append_only();

-- One picture file a run wrote: stored on disk in the bench's file store under its sha256 (`path`, relative to the
-- store), never duplicated; `cost_usd` what making it cost (0 when code cut or drew it).
create table if not exists site_picture_file (
  run_id uuid not null references site_picture_run(id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  path text not null,
  bytes bigint not null check (bytes > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  cost_usd numeric(16, 9) not null default 0,
  created_at timestamptz not null default now(),
  primary key (run_id, sha256)
);
