-- apps/tracy-web/src/db/migrations/123-shard-node.sql
-- Shard beta, the shard side (docs/sre/hop-dong-cua-shard.md §4-§6). Empty on the master: these
-- tables are written only when TRACY_DEPLOYMENT_ROLE=shard. (122 is the master's, W1.)
--
-- shard_mirror        the people this shard holds an account for: handed over by the master
--                     (`source = 'master'`, keyed by the master's account id) or invited here by a
--                     seat holder (`source = 'invitation'`, reported to the master as account.created)
-- shard_handoff       one-time tickets of `POST /_shard/adopt`, redeemed by `GET /handoff` with the
--                     nonce cookie the master set. Only hashes: sha256 of the ticket, and the
--                     `nonceHash` the master sent (the shard never sees the nonce until /handoff).
-- shard_event_outbox  events for the master (`POST /api/shards/:name/events`), sent by the pump
--                     with retries; `event_id` is deterministic, so an event written twice is one row.
create table if not exists shard_mirror (
  email text primary key check (email = lower(email)),
  account_id uuid not null references account(id) on delete cascade,
  source text not null check (source in ('master', 'invitation')),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create table if not exists shard_handoff (
  token_hash text primary key,
  email text not null,
  nonce_hash text not null,
  next text,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shard_handoff_expires_at on shard_handoff (expires_at);
create table if not exists shard_event_outbox (
  event_id text primary key,
  kind text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  attempts int not null default 0,
  next_at timestamptz not null default now(),
  sent_at timestamptz,
  dead_at timestamptz,
  last_error text
);
create index if not exists shard_event_outbox_due on shard_event_outbox (next_at)
  where sent_at is null and dead_at is null;
