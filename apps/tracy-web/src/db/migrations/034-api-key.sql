-- Seat keys: the Bearer credential a person with a live seat mints for one site, so a program
-- outside Tracy (a partner's agent, a CI job) can read and change that site through the api host
-- (`tasks/todo-api-public.md` Q1/S1, `lib/api-key.js`).
--
-- One key = one account + exactly one site. It never grants more than the seat it stands on: the
-- Apply door resolves the seat's toolsets from the role policy and then intersects them with
-- `scopes`, on every call. A seat that is revoked shuts every key minted on it at once (the door
-- re-reads the grant each time); the key row itself is untouched, so a seat granted again brings
-- the key back — unless the key was revoked.
--
-- The secret is never stored: `secret_hash` is HMAC-SHA256(API_KEY_PEPPER, secret), so a database
-- dump holds nothing that authenticates, and rotating the pepper invalidates every key at once
-- (`deploy/.env.example` says so beside the key).
--
-- REVOKE IS PERMANENT. `revoked_at` is written once and never cleared; there is no door that
-- un-revokes, and granting the seat again does not revive a revoked key. A person who needs the
-- access back mints a new key.
create table api_key (
  id text primary key check (id ~ '^[a-z2-7]{16}$'),
  account_id uuid not null references account(id) on delete cascade,
  site_key text not null references site(site_key) on delete cascade,
  label text not null,
  scopes text[] not null check (scopes <@ array['content','code','site','lifecycle'] and cardinality(scopes) > 0),
  secret_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index api_key_account on api_key(account_id) where revoked_at is null;
