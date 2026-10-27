-- REMOVING AN UNFINISHED IMPORT (PR #1598, part 2).
--
-- An import claims its site row (and an accepted owner seat) before the read; a read that failed
-- keeps the row so Retry can reuse it (#1578). Remove (`sites/import-remove.js`) deletes such a row
-- once the host that ran the read confirms no read is going, and the abandoned-import sweep
-- (`cron.js` `sweepAbandonedImports`) calls the same Remove for one left alone.
--
--   removing_at        the right to delete, taken by Remove in ONE guarded statement (only an
--                      unfinished import, only when not already taken). While it is set the claim
--                      door, `/provision` and `/agent` refuse with IMPORT_REMOVING. Lifted when Remove
--                      gives up (the host busy or unreachable); a mark older than its window is a
--                      Remove that died, and the next Remove may take it again.
--   import_touched_at  the last press of the import's claim door (`POST /api/sites {origin:'import'}`):
--                      the claim's own activity, which the sweep reads beside the host's.
alter table site
  add column removing_at timestamptz,
  add column import_touched_at timestamptz;
