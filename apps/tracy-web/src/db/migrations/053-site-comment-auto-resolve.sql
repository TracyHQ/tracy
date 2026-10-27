-- A COMMENT SENT TO TRACY CLOSES ITSELF ON PROOF OF A WRITE (03–04/10/2026, ADR 0025 — reverses
-- stage 6's "a chat turn never changes a comment's status").
--
--   resolved_by_request  the send (`site_request`) whose answered write resolved the comment: Tracy
--                        resolved it, not a person (`resolved_by` stays null). Set by
--                        `markRequestsAnswered` (`sites/comments.js`) when the Apply door stamps
--                        `answered_at` on the request of the comment's LATEST send and nothing new was
--                        written in its thread after that send. Cleared with the rest of the resolve
--                        (a reply, Reopen, a person's Resolve).
--   edited_at            when the author last changed the words or files (`PATCH`). What "new words
--                        after a send" reads for an edit; `updated_at` cannot tell, it moves with every
--                        send, stamp, resolve and reopen too. Null: never edited.
--
-- 🔒 Schema only: nullable columns, no backfill (migrations run in one transaction before the server
-- listens). A comment resolved before this column reads as resolved by whoever `resolved_by` names.
alter table site_comment add column if not exists resolved_by_request uuid references site_request(id) on delete set null;
alter table site_comment add column if not exists edited_at timestamptz;
