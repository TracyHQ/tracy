-- Provider payload is immutable across retries, including after a WordPress resubmission.
create table whitelist_confirmation (
  email text primary key,
  id uuid not null default gen_random_uuid(),
  payload jsonb not null,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  locked_until timestamptz,
  attempts integer not null default 0,
  provider_id text,
  sent_at timestamptz
);
create table whitelist_mail_budget (
  day date primary key,
  reserved integer not null default 0
);
