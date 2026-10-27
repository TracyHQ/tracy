-- Successful installer requests observed by tracy-web, not completed transfers. The update host
-- is sessionless, so direct requests have no account or verified install association. A short-lived
-- request cookie deduplicates retries of the same artifact; it is never a person/device identifier.
create table desktop_download (
  id uuid primary key,
  requested_at timestamptz not null default now(),
  account_id uuid references account(id) on delete set null,
  channel text check (channel in ('stable', 'dev')),
  version text,
  platform text not null,
  arch text,
  file text not null,
  source jsonb not null default '{}'::jsonb,
  install_id uuid references desktop_install(install_id) on delete set null,
  dedupe_key text not null unique
);
create index desktop_download_requested_at on desktop_download (requested_at desc, id);
create index desktop_download_account_time on desktop_download (account_id, requested_at desc);
