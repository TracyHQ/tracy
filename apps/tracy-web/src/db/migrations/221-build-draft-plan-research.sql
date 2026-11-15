-- The research record the living plan of a build draft was composed from (#609, `build-draft/store.js`):
--   plan_research  the research record (brief, asset manifest, picture run) as it was when the plan was composed.
-- A research made while a plan exists replaces `research` but keeps the plan, so the plan's pictures and facts stay
-- those of this record: approval freezes it (not the newer research) with the plan, and the pictures it names are kept
-- (`build-draft/pictures.js` `prune`). Cleared with the plan when the owner starts the plan over.
-- Expand-only: an older image never reads the column, and a draft without it falls back to `research`.
alter table build_draft add column if not exists plan_research jsonb;
