-- Files attached to a comment ("Comment → edit" stage 6, contract
-- `tasks/evidence/comment-people/attachments-contract.md`). Uploaded one at a time through
-- `POST /api/sites/:key/comments/attachments` (`sites/comment-attachments.js`) BEFORE the comment
-- exists, then named by id in the comment's `POST`/`PATCH` (`attachments: [id…]`), which sets
-- `comment_id`. The bytes live in the artifact store (`ARTIFACT_S3_*`) under `object_key`; this row
-- is what the store cannot say: which site and comment the file belongs to, who uploaded it, and
-- what the person called it.
--
-- 🔒 A FILE BELONGS TO ONE SITE. Every read and every attach checks `site_key`, so an id copied
-- from one site's thread is `ATTACHMENT_NOT_FOUND` on another — a seat on site B never reads a
-- file of site A by guessing ids.
--
-- A row with `comment_id` null is an upload nobody attached yet (the person is still typing, or
-- gave up). Such rows older than a day are purged with their objects on the next upload by the
-- same site (`purgeStale`). A comment's soft delete keeps its files for Undo; `purged_at` marks a
-- row whose object was removed.
create table site_comment_attachment (
  id uuid primary key default gen_random_uuid(),
  site_key text not null references site(site_key) on delete cascade,
  comment_id uuid references site_comment(id) on delete cascade,
  uploaded_by uuid not null references account(id) on delete cascade,
  name text not null,
  size integer not null check (size > 0),
  type text not null,
  object_key text not null unique,
  -- Order within the comment, as the person attached them.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  purged_at timestamptz
);

create index site_comment_attachment_comment on site_comment_attachment (comment_id)
  where comment_id is not null;
create index site_comment_attachment_loose on site_comment_attachment (site_key, created_at)
  where comment_id is null;
