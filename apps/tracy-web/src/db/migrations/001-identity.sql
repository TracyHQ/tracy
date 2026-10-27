-- Who signed in, how, and the codes on their way.
create table if not exists account (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create table if not exists otp_code (
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  primary key (email)
);
create table if not exists oauth_state (
  state text primary key,
  provider text not null,
  next text not null,
  expires_at timestamptz not null
);
