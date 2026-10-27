-- Connections and routing belong to an account across all sites and client surfaces.
-- Disconnection removes credentials while preserving identity and the saved order.
create table seat_plan_connection (
  id uuid primary key,
  account_id uuid not null references account(id) on delete cascade,
  provider text not null check (provider in ('claude', 'codex')),
  provider_subject text not null,
  subject_label text not null,
  secret jsonb,
  version integer not null default 1,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  unique (account_id, provider, provider_subject),
  unique (account_id, id)
);
create table seat_plan_routing (
  account_id uuid primary key references account(id) on delete cascade,
  enabled boolean not null default true,
  connection_order jsonb not null default '[]',
  version integer not null default 1
);
create table seat_plan_attempt (
  id uuid primary key,
  account_id uuid not null references account(id) on delete cascade,
  provider text not null check (provider in ('claude', 'codex')),
  state_hash text not null unique,
  browser_binding text not null,
  secret jsonb not null,
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'claimed', 'done', 'failed'))
);
create table seat_plan_pin (
  session_id text primary key,
  site_key text not null references site(site_key) on delete cascade,
  owner_account_id uuid not null references account(id) on delete cascade,
  connection_id uuid,
  provider text,
  model text,
  version integer not null default 1,
  switched_from jsonb,
  pinned_at timestamptz not null default now(),
  foreign key (owner_account_id, connection_id) references seat_plan_connection(account_id, id)
);
