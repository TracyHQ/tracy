-- The build an approval of the build chat's plan starts (#610, `build-draft/build-store.js`), kept in the draft:
--   build  {id, plan: {id, revision}, approvedAt, snapshot: {plan, lastEdit, profile, research}, site?, refusal?,
--          endedAt?, result?}
--   `id` is the site creation's buildId, one per draft, so approving twice or asking again never makes a second site.
--   `snapshot` is the approved plan with the needs profile and the research record (brief, asset manifest, picture run)
--   it was gated with, frozen at approval: the run reads it, never the living draft, so a newer research or a plan
--   edit cannot change what the owner approved. The pictures its research run stored are kept until `endedAt`.
-- Expand-only: an older image never reads the column.
alter table build_draft add column if not exists build jsonb;
