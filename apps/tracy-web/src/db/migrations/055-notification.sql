-- The notification log (spec #809, 03/10/2026): one row per event a person should learn about,
-- read by the Inbox tab and sent as an email at the same time.
--
-- 🔒 THE SERVER WRITES A ROW AT THE MOMENT THE EVENT HAPPENS (a comment saved, a request approved, a
-- seat revoked), never the browser: a tab closed half-way must not lose anyone's notification.
--
-- WORDS ARE NOT STORED. `kind` names the case (`team.invited`, `comment.mention`, …) and `data` holds
-- the facts the sentence needs (actor name, role, quoted words, comment number). The Inbox writes the
-- sentence in the reader's own language from those facts, so one row reads right in every language and
-- a later rewording changes old rows too.
--
-- `ref` ties rows about the same thing together (a join request: `join:<site_key>:<account_id>`), so a
-- later event can find the rows it settles — "Lee approved Vincent" closes the other admins' "Vincent
-- asked to join" — without guessing from `data`.
create table notification (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  kind text not null,
  site_key text,
  actor_account_id uuid references account(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  ref text,
  -- When another event made this row's action moot (another admin answered the same join request).
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Whether the row shows in the Inbox (Settings › Notifications can turn the Inbox off per group
  -- while the email stays on; a row with both off is never written).
  in_inbox boolean not null default true,
  -- THE ROW IS ITS OWN MAIL OUTBOX. `none`: no email for this row (its channel is off, or the event
  -- mails by itself, like an invitation with its signed accept link). `pending`: due, or due again
  -- after a failure (`mail_attempts`, `mail_error`). `held`: waiting to be grouped with later rows
  -- of the same thread (`ref`), sent after `mail_due_at`. `sent` with `mailed_at`. `failed` after the
  -- last attempt. The letter is rendered again from `kind` + `data` on every attempt, in the
  -- recipient's language at that moment.
  mail_state text not null default 'none' check (mail_state in ('none', 'pending', 'held', 'sent', 'failed')),
  mail_due_at timestamptz,
  mail_attempts integer not null default 0,
  mail_error text,
  mailed_at timestamptz
);

-- The Inbox list, newest first (`GET /api/notifications`).
create index notification_account_created on notification (account_id, created_at desc);
-- The unread count the left column polls every 30 seconds.
create index notification_account_unread on notification (account_id) where read_at is null;
-- The cron's retry and grouping sweep: rows whose mail is still owed.
create index notification_mail_due on notification (mail_due_at) where mail_state in ('pending', 'held');
-- "Every row about this join request" (`ref`).
create index notification_ref on notification (ref) where ref is not null;
