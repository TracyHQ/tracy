-- Invitations mailbox credentials are encrypted with a dedicated deployment key.
-- This table never authorizes sending; its generation fences later mail adapters.
create table invitations_mailbox (
  id text primary key check (id = 'gmail'),
  generation bigint not null default 0,
  status text not null default 'not_connected',
  address text,
  scopes text[] not null default '{}',
  refresh_cipher text,
  refresh_generation bigint,
  key_id text,
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  error_code text,
  updated_at timestamptz not null default now()
);
create table invitations_mailbox_oauth (
  state_hash text primary key,
  actor text not null,
  session_hash text not null,
  generation bigint not null,
  verifier_cipher text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table invitations_mailbox_audit (
  id bigserial primary key,
  actor text not null,
  action text not null,
  generation bigint not null,
  result text not null,
  created_at timestamptz not null default now()
);
