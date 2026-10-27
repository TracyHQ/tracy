-- Preserve the received Find candidate pool so cached checks can change selection without another search.
alter table wo_prefetch_campaign add column selection_candidates jsonb not null default '[]'::jsonb;
-- Keep Find's automatic admission refusals across cron ticks, including not_queued and deferred dates.
alter table wo_prefetch_campaign add column selection_observations jsonb not null default '{}'::jsonb;
-- A previously running pilot must not admit its old unranked selection during cutover.
update wo_prefetch_campaign set enabled=false,
  last_error='Find selection upgrade required; Start replays received discovery receipts only'
  where seed_source->>'id'='google-places-text'
    and seed_source->>'rankingVersion' is distinct from 'find-v1';
