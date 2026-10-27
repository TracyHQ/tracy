-- One paid attempt belongs to the shared profile, not to a user or a worker lease.
-- Persist starting BEFORE POST: a missing run receipt must never cause an automatic paid retry.
-- Money and immutable provider run receipts remain in wo_cost_ledger (migration 135).
alter table wo_social_stat add column if not exists apify_attempt jsonb;
