-- THE ANSWER TRACY GAVE, KEPT WITH THE TURN (plan tasks/todo-open-conversation.md §C).
--
-- A dsh session opens only for the person who created it (dsh-passwords), so a teammate reading
-- Site changes could see what was asked (`title`) but never what Tracy said back. The host's
-- site-tabs plugin now takes the text of the turn's LAST assistant message when the turn stops —
-- text blocks only: no tool call, no tool result, no reasoning; a code block becomes "[code]" —
-- and sends it with `POST /moment`. The door cuts it again (2000 characters, between words) and
-- stores it here. It is the agent's own account, not evidence of the result: descriptions and
-- effects stay the source of truth.
--
--   reply        the filtered, cut answer; null = none sent (a dsh that predates this, or a turn
--                that ended with no text). Never backfilled.
--   reply_state  `full` · `truncated` (cut by the host or the door) · `interrupted` (the turn was
--                cancelled mid-answer: the words delivered so far); null with `reply`.
--
-- 🔒 Schema only: nullable columns, no backfill, no scan (048/049: migrations run in one
-- transaction before the server listens).
alter table site_turn add column if not exists reply text;
alter table site_turn add column if not exists reply_state text;
