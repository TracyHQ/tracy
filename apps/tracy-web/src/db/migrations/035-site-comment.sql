-- Comments on a customer site's pages (`tasks/todo-comment-thread.md` § D, contract H-S), read and
-- written through `/api/sites/:key/comments` (`sites/comments.js`). Until now a comment lived in a
-- browser tab's `meta` and one browser's localStorage, with no author; on the server several people
-- on one site see each other's comments, each has a real author, and nothing is lost with the device.
--
-- `element` and `locate` are stored as the objects the Browser tab sends in `tracy:comment-send` v2,
-- untouched: the server does not interpret them, the tab and the chat composer do.
--
-- 🔒 `n` IS NEVER REUSED. It is what the customer reads ("comment 3") and what a chat turn cites, so
-- a number handed out once must never name a different comment later, even after the first one is
-- deleted. It comes from `site_comment_counter`, one row per site bumped under that row's lock,
-- rather than from `max(n) + 1`: two racing inserts would both read the same max, and a hard delete
-- (a site's rows cascading away) would hand old numbers out again.
--
-- DELETES ARE SOFT (`deleted_at`): the poll (`GET ?since=`) must be able to tell other browsers a
-- comment went away, and a vanished row says nothing.
create table site_comment_counter (
  site_key text primary key references site(site_key) on delete cascade,
  last_n integer not null default 0
);

create table site_comment (
  id uuid primary key default gen_random_uuid(),
  site_key text not null references site(site_key) on delete cascade,
  n integer not null,
  author_account_id uuid not null references account(id) on delete cascade,
  url text not null,
  element jsonb,
  locate jsonb,
  text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'working', 'done', 'failed', 'asked', 'resolved')),
  -- The status the comment had when it was resolved, so reopen can put it back (H-S: "reopen
  -- returns the previous status"). Null whenever the comment is not resolved.
  resolved_from text
    check (resolved_from is null or resolved_from in ('pending', 'sent', 'working', 'done', 'failed', 'asked')),
  request_id text,
  -- The last status report applied (`PATCH` with `callId`); the same report arriving again — two
  -- tabs of one author both relaying it — is a no-op.
  call_id text,
  question text,
  reply_to uuid references site_comment(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references account(id) on delete set null,
  deleted_at timestamptz,
  unique (site_key, n)
);

-- The poll: "what changed on this site since t".
create index site_comment_site_updated on site_comment (site_key, updated_at);
