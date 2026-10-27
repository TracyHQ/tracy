-- Local launcher codes are capabilities, never email sign-in codes or cloud credentials.
create table if not exists local_launch (
  code_hash text primary key,
  installation_id uuid not null,
  expires_at timestamptz not null
);
create index if not exists local_launch_expiry on local_launch (expires_at);
