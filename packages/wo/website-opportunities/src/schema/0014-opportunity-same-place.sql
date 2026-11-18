-- One account may hold several cards of the same place (#537 R23): an approved card is final, so a change after
-- approval is made on a new card of that place (`POST /api/website-opportunities`). The one-row-per-place rule goes;
-- a plain index keeps the lookups of a place's cards (`store.js insertOpportunity`, `sameAsOf`) fast.
-- Existing rows stay valid: every one of them already met the stricter rule.
-- Expand-only: an older image saved with `on conflict (account_id, provider, provider_id)`, which needs the unique
-- rule, so roll the image forward with this file.
alter table wo_opportunity drop constraint if exists wo_opportunity_account_id_provider_provider_id_key;
create index if not exists wo_opportunity_account_place on wo_opportunity (account_id, provider, provider_id);
