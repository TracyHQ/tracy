-- Site-bound OAuth consent and PKCE codes. Only hashes of code and refresh secrets are stored.
create table mcp_oauth_grant (
  id text primary key,
  client_id text not null,
  account_id uuid not null references account(id) on delete cascade,
  site_key text not null references site(site_key) on delete cascade,
  resource text not null,
  scopes text[] not null,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table mcp_oauth_code (
  hash text primary key,
  client_id text not null,
  account_id uuid not null references account(id) on delete cascade,
  site_key text not null references site(site_key) on delete cascade,
  resource text not null,
  scopes text[] not null,
  challenge text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  grant_id text references mcp_oauth_grant(id) on delete cascade
);
create table mcp_oauth_refresh (
  hash text primary key,
  grant_id text not null references mcp_oauth_grant(id) on delete cascade,
  used_at timestamptz
);
create index mcp_oauth_refresh_grant on mcp_oauth_refresh(grant_id);
create table mcp_oauth_access (
  key_id text primary key references api_key(id) on delete cascade,
  grant_id text not null references mcp_oauth_grant(id) on delete cascade
);
create index mcp_oauth_access_grant on mcp_oauth_access(grant_id);
