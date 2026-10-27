-- Help is asked from the agent's chat as `/help <question>` (tasks/todo-lenh-help.md), so its
-- conversation belongs to an AGENT SESSION, not to the account as a whole.
--
-- 1. `assistant_conversation.session_id`: the agent session the question was asked in. The empty
--    string is the account-level conversation 065 created (the floating-button era, and the one the
--    Telegram handoff still uses); it keeps working and is not shown inside any session. An account
--    now has one current conversation PER SESSION, so the unique index gains the session.
--    `not null default ''` rather than null: a null would make every account-level row distinct in
--    a unique index and let two "current" ones in.
-- 2. `assistant_turn.anchor_seq`: the seq of the last entry of the session log when the
--    question was asked. A reload draws the Help rows back at the same place in the transcript.
--    Null for turns written before this migration or without a session.
-- 3. `assistant_tip_seen`: the one-time "type /help" tip is shown once per ACCOUNT, not once per
--    browser, so it is kept here.
alter table assistant_conversation add column session_id text not null default '';
-- double precision: a seq in the client's chat snapshot may be fractional.
alter table assistant_turn add column anchor_seq double precision;

drop index assistant_conversation_current;
create unique index assistant_conversation_current
  on assistant_conversation (account_id, session_id) where cleared_at is null;

create table assistant_tip_seen (
  account_id uuid primary key references account(id) on delete cascade,
  seen_at timestamptz not null default now()
);
