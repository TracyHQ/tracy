-- Who has read which comment, per PERSON (Comments list redesign, 01/10/2026,
-- `tasks/comments-list-redesign-plan.md`), and which "Ask Tracy to edit" Tracy answered with a write.
--
-- READ STATE IS ONE PERSON'S, ON THE SERVER. A row says this account opened this comment's thread at
-- `read_at`; a row whose `read_at` is null says the person chose "Mark as unread". No row: never
-- opened. Whether a comment is unread is decided where it is shown (the Comments tab), from this row
-- and the thread's activity: unread when marked so, or when anyone else wrote in the thread (the
-- comment itself or a reply) after `read_at` (or ever, with no row). Not the browser's storage: it
-- would differ per machine, per browser and in the desktop app, and vanish with the site's data — and
-- an unread mark people trust and that lies is worse than none.
create table site_comment_read (
  comment_id uuid not null references site_comment(id) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  site_key text not null references site(site_key) on delete cascade,
  read_at timestamptz,
  primary key (comment_id, account_id)
);

-- "My read marks on this site" (`GET /api/sites/:key/comments/reads`).
create index site_comment_read_account_site on site_comment_read (account_id, site_key);

-- 🔒 "DONE BY TRACY" IS A WRITE THAT CITED THE REQUEST, NOTHING LESS. When a site write through the
-- Apply door succeeds carrying `comment: [n…]` (`tracy-site-tools` `comment-echo.mjs`), the door
-- stamps `answered_at` on those requests — only the caller's own, on that site, within the comment
-- answer window (`sites/comment-answer.js`). The Comments tab reads it from each comment's sends
-- (`answeredAt`). A write that never passes the Apply door (an EmDash site's own tools, a look change
-- by file) carries no number and stamps nothing: such a comment stays "Asked Tracy".
alter table site_request add column answered_at timestamptz;
