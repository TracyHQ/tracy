-- WHAT AN UNDO PRESS PROVED, apart from the press itself (migration 067 stamps the press).
--
-- One stamp served two readers with different rules. The agent's "earlier request undone" notice
-- (`undoneSince`) must hear of a press even when nothing is known to have gone (the host answered 202
-- FLEET_JOB_PENDING, a revert left `unsure`): the person asked for it, and the agent must not tell them
-- something on their side is putting the old wording back. The Site changes row ("Undone" / "Partly
-- undone", and whether it still offers Undo) is UNDONE ONLY BY PROOF (activity-v2.js, SYSTEM.md §5).
--
--   undone_at        (067) the last undo press that undid, or may have undone, anything of this turn;
--                    read by the agent notice and by ops usage (it counts presses). null: never pressed.
--   undo_proven_at   the last press that verifiably undid something of this turn: a moment undone, a
--                    content write reverted, a look undone. Read by Site changes. A later press that
--                    proves nothing leaves it as it was. null: nothing of the turn proven undone.
--   undo_complete    (067) unchanged: the LAST press undid all of the turn, written by every press
--                    (a press that proves nothing undid nothing for sure: false). Read by the agent
--                    notice only.
--   undo_proven_complete  some proving press undid all of the turn; once true, a later press never
--                    sets it back to false (a complete undo stays complete). Read by Site changes
--                    with `undo_proven_at`. null: nothing of the turn proven undone.
--
-- Backfill: a row 067 stamped `undo_complete = true` was proven — `undoneMarks` calls a press complete
-- only when every moment of the turn is in the verified set and every write and look verifiably went
-- back, and each press overwrote both columns, so that press is the one `undone_at` holds: both new
-- columns take it (`undo_proven_complete = true`). A row
-- stamped `undo_complete = false` cannot be told apart (part went, or nothing is known to have gone:
-- the audit row does not say which moments of a turn were verified), so it stays null: it shows no
-- "Undone" mark and keeps its Undo, as an unproven row should.
--
-- 🔒 No index: read with the row it belongs to.
alter table site_turn add column if not exists undo_proven_at timestamptz;
alter table site_turn add column if not exists undo_proven_complete boolean;
update site_turn set undo_proven_at = undone_at, undo_proven_complete = true
 where undo_complete is true and undone_at is not null and undo_proven_at is null;
