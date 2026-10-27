-- One-time hints belong to the account, across browsers and devices. The first seen_at stays.
-- Keep the closed list in sync with seen-hints/store.js; arbitrary client keys are not stored.
create table account_seen_hint (
  account_id uuid not null references account(id) on delete cascade,
  hint text not null check (hint in ('site-tour', 'voice-tip')),
  seen_at timestamptz not null default now(),
  primary key (account_id, hint)
);
