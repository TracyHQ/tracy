-- Account-level OAuth credentials for outside apps (Website Opportunities' "Connect Tracy",
-- `tasks/todo-wo-public-demos.md` A). A grant names an ACCOUNT, never a site: seat keys
-- (`api_key`, migration 034) keep their required `site_key` and their own fences. Only hashes of
-- device codes, user codes, access secrets and refresh tokens are stored.
create table account_grant (
  id text primary key,
  client_id text not null,
  account_id uuid not null references account(id) on delete cascade,
  audience text not null,
  scopes text[] not null check (scopes <@ array['demos'] and cardinality(scopes) > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index account_grant_account on account_grant(account_id) where revoked_at is null;
-- One access token id per grant: refresh rotates its secret, never its id.
create table account_token (
  id text primary key check (id ~ '^[a-z2-7]{16}$'),
  grant_id text not null unique references account_grant(id) on delete cascade,
  secret_hash text not null,
  expires_at timestamptz not null
);
-- Spent refresh tokens stay as reuse detectors: presenting one again revokes the grant.
create table account_refresh (
  hash text primary key,
  grant_id text not null references account_grant(id) on delete cascade,
  used_at timestamptz
);
create index account_refresh_grant on account_refresh(grant_id);
-- RFC 8628 device authorization: `decision` is written on /connect, the code is spent at /oauth/token.
create table oauth_device_code (
  hash text primary key,
  user_code_hash text not null unique,
  client_id text not null,
  audience text not null,
  scopes text[] not null,
  account_id uuid references account(id) on delete cascade,
  decision text check (decision in ('allow', 'deny')),
  interval_seconds integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_poll_at timestamptz,
  used_at timestamptz,
  grant_id text references account_grant(id) on delete cascade
);
