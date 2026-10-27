-- Settings › Notifications (spec #809, step 5): what a person turned OFF, per group of kinds and per
-- channel (Inbox, Email).
--
-- 🔒 NO ROW = ON. Everything is on by default, so a person who never opened the page has no rows,
-- and a group added later starts on for everyone without a backfill. A row is written the first
-- time the person flips a switch of that group.
--
-- `group_id` names a group of `NOTIFICATION_GROUPS` in `src/notifications/preferences.js` (the one
-- place that maps a kind to its group), never a kind: the page shows five rows, not sixteen kinds.
-- The locked group (join requests) is never written; the server ignores any attempt to turn it off.
create table notification_preference (
  account_id uuid not null references account(id) on delete cascade,
  group_id text not null,
  inbox boolean not null default true,
  email boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (account_id, group_id)
);
