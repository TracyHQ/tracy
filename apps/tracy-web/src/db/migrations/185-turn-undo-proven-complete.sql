-- WHETHER A COMPLETE UNDO WAS EVER PROVEN, apart from what the last press did (migration 182 follow-up).
--
-- 182 made `undo_complete` serve Site changes as well as the agent notice, with two rules at once: the
-- notice (`undoneSince`) must say what the LAST press did, as 067 did; Site changes must never lose an
-- earlier complete proof. A complete press followed by a proven partial one could satisfy only one of
-- them. Each reader now has its own column:
--
--   undo_complete         (067) back to the last press: written by every press, false when that
--                         press proved nothing. Read by the agent notice only.
--   undo_proven_complete  some proving press undid all of the turn; once true, a later press never
--                         sets it back. Read by Site changes with `undo_proven_at` (182). null: nothing
--                         of the turn proven undone.
--
-- Backfill, from what the columns already say. Every row with `undo_proven_at` set was written either
-- by 182's own backfill (only rows 067 stamped complete) or by 182's code, which wrote `undo_complete`
-- only on proven presses and kept it true once true — so on those rows `undo_complete` IS the sticky
-- proof, and it is copied. A row with no `undo_proven_at` has nothing proven: it stays null. Until
-- such a row's next press, its `undo_complete` keeps 182's meaning for the notice; the notice names a
-- press only once, at the next turn, so the old value is read at most once.
--
-- 🔒 No index: read with the row it belongs to.
alter table site_turn add column if not exists undo_proven_complete boolean;
update site_turn set undo_proven_complete = (undo_complete is true)
 where undo_proven_at is not null and undo_proven_complete is null;
