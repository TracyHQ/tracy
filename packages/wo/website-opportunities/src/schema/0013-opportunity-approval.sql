-- The seller approves the Profile, then the Content brief, before the next step unlocks (#537).
-- profile_approved_at  when the seller approved the Profile (`POST …/:id/profile/approve`); null: it needs review.
--                      A Profile edit after it clears it.
-- brief_approved_at    when the seller approved the latest brief (`POST …/:id/brief/approve`); a newer brief needs
--                      its own approval.
-- profile_changed_at   the last Profile edit (any row, or a photo the seller added): a brief made before it is stale.
-- sources_changed_at   when the seller added a source after research ran (`POST …/:id/sources`): research is needed
--                      again, and a brief made before it is stale.
-- Existing rows keep nulls, so an opportunity researched before this asks for its Profile and brief to be approved.
-- Expand-only: an older image never reads them.
alter table wo_opportunity add column if not exists profile_approved_at timestamptz;
alter table wo_opportunity add column if not exists brief_approved_at timestamptz;
alter table wo_opportunity add column if not exists profile_changed_at timestamptz;
alter table wo_opportunity add column if not exists sources_changed_at timestamptz;
