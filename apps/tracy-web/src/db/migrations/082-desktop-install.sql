-- Which Tracy Cowork desktop apps exist and who uses them (tasks/todo-desktop-auto-update.md,
-- 09/10). One row per install id — the UUID electron-updater keeps in the app's userData and sends
-- as `x-user-staging-id` on every read of `<channel>-mac.yml`. `account_id` is filled once the
-- signed-in app reports its id (`POST /api/desktop/installs/link`); a deleted account leaves the
-- machine row behind, unlinked.
create table desktop_install (
  install_id uuid primary key,
  channel text not null check (channel in ('stable', 'dev')),
  version text,
  arch text,
  os_version text,
  account_id uuid references account(id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  linked_at timestamptz
);
create index desktop_install_last_seen on desktop_install (last_seen desc);
