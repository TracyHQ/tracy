-- The owner's review of the living plan on the plan card (#575, `build-draft/store.js`):
--   plan_review  {base, count, removals, before}: `base` the plan and needs profile before the owner's first change
--                (what "back to the original" puts back), `count` how many changes the owner made since, `removals`
--                the removal records of the parts the owner took off (what a restore puts back, `plan-operations.mjs`),
--                `before` the review as it was before the last change (what one undo puts back).
--                A new plan and a restart clear it; the door answers only its count, removals' ids and whether a base
--                is kept.
-- Expand-only: an older image never reads the column, and a draft without it has no review to undo or revert.
alter table build_draft add column if not exists plan_review jsonb;
