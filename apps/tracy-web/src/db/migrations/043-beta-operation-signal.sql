alter table otp_code add column admission jsonb;
alter table account add column beta_admission jsonb;

create table beta_access_cache (
  email_hash text primary key,
  result jsonb not null,
  expires_at timestamptz not null
);
create table beta_fallback (
  email_hash text primary key,
  source_day date not null,
  imported_at timestamptz not null default now()
);
create table beta_login_job (
  email text primary key,
  request_id uuid not null,
  via text not null,
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  locked_until timestamptz,
  expires_at timestamptz not null,
  error text
);
create table beta_waitlist (
  email text primary key,
  name text not null,
  website text,
  platforms jsonb not null,
  role text not null,
  site_count text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No cascading foreign keys: deleting a site or account must not erase its analytics.
create table ops_signal (
  id bigserial primary key,
  kind text not null,
  occurred_at timestamptz not null default now(),
  account_id uuid,
  site_key text,
  data jsonb not null,
  dedupe_key text unique,
  telegram_required boolean not null default false,
  telegram_sent_at timestamptz,
  telegram_error text,
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  locked_until timestamptz
);
create index ops_signal_day_kind on ops_signal (occurred_at, kind);
create index ops_signal_pending on ops_signal (next_at)
  where telegram_required and telegram_sent_at is null;
create table ops_active_day (
  account_id uuid not null,
  day date not null,
  primary key (account_id, day)
);
create table ops_stuck_notice (
  site_key text primary key,
  occurred_at timestamptz not null default now()
);
