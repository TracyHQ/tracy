-- What someone sent to Tracy from a site's page — the internal record behind "Send to Tracy"
-- (`tasks/todo-comment-people.md` rule 8, contract `tasks/evidence/comment-people/contract.md` § H1).
--
-- Since stage 6 "Send to Tracy" never creates a comment: the words and the picked element go
-- straight into a chat message. The server still needs to know that the person really sent them,
-- so an Apply call citing the number can write for whoever sent it (`sites/comment-answer.js`), and
-- which comments were already sent ("Send N" counts the open ones never sent). One row per item
-- sent, written by `POST /api/sites/:key/requests` right before the chat message goes. Nobody sees
-- these rows: no tab, no pin, no list.
--
-- 🔒 `n` COMES FROM `site_comment_counter`, THE SEQUENCE COMMENTS USE. A chat turn cites a number
-- (`comment: n` on the Apply door), and one number must name one thing on the site, so comments and
-- requests share one sequence and never collide; `unique (site_key, n)` here plus the counter's row
-- lock keep it so. There is no upper bound on `n`.
--
-- `comment_id` is set when the item was sent from an existing comment or thread ("Send N", the
-- thread card's Send to Tracy): "never sent" for a comment means no row points at it. Comments are
-- deleted softly, so `on delete set null` only matters when a whole site goes.
create table site_request (
  id uuid primary key default gen_random_uuid(),
  site_key text not null references site(site_key) on delete cascade,
  n integer not null,
  account_id uuid not null references account(id) on delete cascade,
  -- The dsh chat session and the chat turn the message went into.
  session_id text not null,
  request_id text not null,
  url text not null,
  element jsonb,
  text text not null,
  comment_id uuid references site_comment(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (site_key, n)
);

-- "Was this comment ever sent" (`sentToTracy` on every comment row the list returns).
create index site_request_comment on site_request (comment_id) where comment_id is not null;
