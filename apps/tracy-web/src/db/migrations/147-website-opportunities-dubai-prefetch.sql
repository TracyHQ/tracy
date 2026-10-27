-- One opt-in central pilot. No provider credentials or paid admission are available to this campaign.
create table wo_prefetch_campaign (
  id text primary key check (id = 'dubai'),
  enabled boolean not null default false,
  seed_source jsonb not null,
  selection_rule text not null,
  created_at timestamptz not null default now(),
  last_tick_at timestamptz,
  next_tick_at timestamptz not null default now(),
  tick_count integer not null default 0,
  last_error text,
  paid_enabled boolean not null default false check (paid_enabled = false)
);
create table wo_prefetch_seed (
  campaign_id text not null references wo_prefetch_campaign(id),
  external_id text not null,
  place_id uuid not null references wo_place(id),
  facts jsonb not null,
  job_id uuid references wo_place_job(id),
  next_refresh_at timestamptz not null default now(),
  primary key(campaign_id, external_id),
  unique(campaign_id, place_id)
);
alter table wo_place_job add column prefetch_campaign_id text references wo_prefetch_campaign(id);
alter table wo_place_snapshot add column enrichment_scope text not null default 'full'
  check(enrichment_scope in ('full','prefetch'));
alter table wo_place_link drop constraint wo_place_link_verified_by_check;
alter table wo_place_link add constraint wo_place_link_verified_by_check
  check(verified_by in ('identity','google','website','operator','osm'));
