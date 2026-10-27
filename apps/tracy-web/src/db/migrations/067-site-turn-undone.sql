-- WHEN A CHAT TURN WAS UNDONE FROM THE CHAT (undo card, `POST /api/sites/:key/turns/undo`), so the
-- conversation's next turn can tell the agent (`POST /api/sites/:key/turn` answers `undone`).
--
-- The undo reverts with the person's own session header, so `GET /changed` reads the revert as made
-- "by this conversation" and the site-changed notice stays silent: without this mark the agent saw
-- the old wording back and told the person something on their side was putting it back (06/10/2026).
--
--   undone_at      the last undo press that undid anything of this turn; null: never undone.
--   undo_complete  that press undid all of the turn (files and content); false: only part of it.
--
-- 🔒 No index: read only by `(site_key, session_id)`, a handful of rows per conversation.
alter table site_turn add column if not exists undone_at timestamptz;
alter table site_turn add column if not exists undo_complete boolean;
