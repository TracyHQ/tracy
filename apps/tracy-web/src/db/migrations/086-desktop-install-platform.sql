-- Which operating system each desktop install runs (tasks/todo-desktop-windows.md, 10/10).
-- The feed learns it from the channel file the app reads: `<channel>-mac.yml` = mac,
-- `<channel>.yml` = win, `<channel>-linux[-arm64].yml` = linux. Every row before this migration
-- came from a `-mac.yml` read, so the default backfills them as mac. The one writer
-- (`lib/desktop-install.js` `recordCheck`) always names the platform; the default stays only so
-- fixtures and rows written by older code keep meaning what they meant.
alter table desktop_install
  add column platform text not null default 'mac' check (platform in ('mac', 'win', 'linux'));
