-- The build draft becomes engine aware (#609, `build-draft/store.js`). The living plan is written only by the engine:
-- a plan that came out of the plan composer and its rules gate (`putComposed`), or a customer edit that passed the
-- edit gate (`editPlan`, `undoPlanEdit`). The edit gate reads the settled needs profile the plan was composed from,
-- so the draft keeps it beside the plan, and a gated edit writes both in one transaction.
--   needs_profile  the settled needs profile of the living plan (after the owner's answers and gated edits)
--   research       the research record the profile was read from, kept for a later compose of the same business
--   fault          the last system fault of the chat build, for the team only: never shown to the owner
--   undo_profile   the needs profile before the last gated edit, so an undo restores it exactly
-- Expand-only: an older image never reads these columns.
alter table build_draft add column if not exists needs_profile jsonb;
alter table build_draft add column if not exists research jsonb;
alter table build_draft add column if not exists fault jsonb;
alter table build_draft add column if not exists undo_profile jsonb;
