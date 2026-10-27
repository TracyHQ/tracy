-- Verified URL spellings point at an ID-owned stat row. Legacy jobs and receipts stay in place.
create table wo_social_alias (
  alias_key text primary key,
  owner_key text not null references wo_social_stat(stat_key),
  network text not null,
  platform_id text not null,
  provider text not null,
  observed_at timestamptz not null,
  verified_at timestamptz not null,
  invalidated_at timestamptz,
  check (network in ('facebook', 'instagram', 'tiktok', 'youtube'))
);
create index wo_social_alias_owner on wo_social_alias(owner_key);

-- Reconciliation facts from RapidAPI headers never increase an allocation.
alter table wo_social_stat add column provider_quota jsonb;
