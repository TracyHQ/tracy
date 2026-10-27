-- The AI Assistant hands a conversation to a person (05/10/2026): a Customer Service
-- Telegram forum group gets one topic per handoff, staff replies come back to the panel, and the
-- conversation survives the browser closing until the person clears it.
--
-- WHAT CHANGES FOR 064's ROWS. A conversation was only an id the browser held for one page load.
-- It now has a row of its own, owned by the account, and an account has exactly ONE current
-- conversation (`cleared_at is null`) that every device and every site of that account opens on.
-- The backfill makes each account's most recent conversation its current one and marks the
-- others cleared, so `064`'s turns stay readable and nothing is merged into one transcript.
--
-- 🔒 THE STATE DECIDES WHO ANSWERS, not the browser: `ai` → the model; `waiting_human` (asked for a
-- person, no reply yet) and `human` → nobody but staff, and the model is never called.
create table assistant_conversation (
  id uuid primary key,
  account_id uuid not null references account(id) on delete cascade,
  state text not null default 'ai' check (state in ('ai', 'waiting_human', 'human')),
  -- The newest turn the person has seen in the open panel; what is above it is the unread badge.
  last_read_turn_id bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleared_at timestamptz
);
create unique index assistant_conversation_current on assistant_conversation (account_id) where cleared_at is null;
create index assistant_conversation_cleared on assistant_conversation (cleared_at) where cleared_at is not null;

-- 064 accepted a conversation id from the browser, so the same id can, in principle, sit under two
-- accounts. The first owner by time keeps it; turns written under another account with that id
-- simply have no conversation row and are never read again.
insert into assistant_conversation (id, account_id, created_at, updated_at, cleared_at)
select distinct on (t.conversation_id)
       t.conversation_id, t.account_id, min(t.created_at), max(t.created_at), now()
  from assistant_turn t
 group by t.conversation_id, t.account_id
 order by t.conversation_id, min(t.created_at)
on conflict (id) do nothing;
update assistant_conversation c set cleared_at = null
  from (select distinct on (account_id) id from assistant_conversation
         order by account_id, updated_at desc, id desc) latest
 where c.id = latest.id;

-- One request for a person. Asking again later REOPENS the account's last topic (
-- 06/10/2026), so the team reads the whole history in one place: several ended handoffs may share a
-- topic, and only one open handoff may hold it at a time.
create table assistant_handoff (
  id uuid primary key,
  account_id uuid not null references account(id) on delete cascade,
  conversation_id uuid not null references assistant_conversation(id) on delete cascade,
  chat_id text not null,
  -- Null until the outbox has created the topic.
  topic_id bigint,
  status text not null default 'open' check (status in ('open', 'ended')),
  ended_reason text check (ended_reason in ('resolved', 'back_to_ai', 'cleared')),
  opened_at timestamptz not null default now(),
  first_staff_reply_at timestamptz,
  ended_at timestamptz
);
create unique index assistant_handoff_open on assistant_handoff (conversation_id) where status = 'open';
create unique index assistant_handoff_topic on assistant_handoff (chat_id, topic_id) where topic_id is not null and status = 'open';
create index assistant_handoff_account_topic on assistant_handoff (account_id, chat_id, opened_at desc) where topic_id is not null;

-- A picture a staff member sent, kept in the artifact store (R2; MinIO on a local stand) under a
-- key chosen here. Served only to the account that owns the conversation.
create table assistant_attachment (
  id uuid primary key,
  account_id uuid not null references account(id) on delete cascade,
  conversation_id uuid not null references assistant_conversation(id) on delete cascade,
  object_key text not null,
  content_type text not null,
  bytes integer not null,
  created_at timestamptz not null default now()
);

alter table assistant_turn drop constraint assistant_turn_role_check;
alter table assistant_turn add constraint assistant_turn_role_check check (role in ('user', 'assistant', 'staff'));
alter table assistant_turn add column handoff_id uuid references assistant_handoff(id) on delete set null;
-- The staff member's Telegram first name, as the customer sees it; never their Telegram id.
alter table assistant_turn add column staff_name text;
alter table assistant_turn add column telegram_message_id bigint;
alter table assistant_turn add column attachment_id uuid references assistant_attachment(id) on delete set null;
-- Telegram redelivers an update it is not sure we took; the same message must not land twice.
create unique index assistant_turn_telegram on assistant_turn (handoff_id, telegram_message_id)
  where telegram_message_id is not null;

-- What still has to reach Telegram, in order per handoff: create (or reopen) the topic, the summary, each
-- customer message, the closing note, closing the topic. Written in the same transaction as the
-- change that caused it, so a crash between the two never loses one.
create table assistant_outbox (
  id bigserial primary key,
  handoff_id uuid not null references assistant_handoff(id) on delete cascade,
  kind text not null check (kind in ('create_topic', 'reopen_topic', 'send_text', 'close_topic')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  lease_until timestamptz,
  done_at timestamptz,
  error text
);
create index assistant_outbox_due on assistant_outbox (handoff_id, id) where done_at is null;

-- Long polling only (a laptop with no public address): where getUpdates left off, per bot.
create table assistant_telegram_offset (
  bot text primary key,
  next_update_id bigint not null default 0,
  updated_at timestamptz not null default now()
);
