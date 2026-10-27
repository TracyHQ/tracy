-- The first-run "Welcome to Tracy" popup joins the account's one-time hints (seen-hints/store.js).
-- Same table, one more name in its closed list; the first seen_at still stays.
alter table account_seen_hint drop constraint account_seen_hint_hint_check;
alter table account_seen_hint add constraint account_seen_hint_hint_check
  check (hint in ('site-tour', 'voice-tip', 'welcome'));
