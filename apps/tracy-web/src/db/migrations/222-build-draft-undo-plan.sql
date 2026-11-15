-- One step of undo for a change asked for in the build chat (#609 over #617, `build-draft/store.js`):
--   undo_plan  the living plan as it was before the last change request revised it. With `undo_profile` (the needs
--              profile before it), the undo door puts both back, as it takes back a card edit. A card edit, a new plan
--              and a restart clear it; it is never answered by a door.
-- Expand-only: an older image never reads the column, and a draft without it offers the undo of a card edit only.
alter table build_draft add column if not exists undo_plan jsonb;
