-- Shared social authority and immutable observations. No provider attempt or receipt is moved.
create sequence wo_social_revision_seq;
create table wo_social_authority (
  singleton boolean primary key default true check (singleton),
  authority_id uuid not null unique default gen_random_uuid()
);
insert into wo_social_authority (singleton) values (true);

alter table wo_social_stat add column revision bigint not null default nextval('wo_social_revision_seq');
create function wo_social_stat_revised() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new)-'revision') is distinct from (to_jsonb(old)-'revision') then
    new.revision := nextval('wo_social_revision_seq');
  else new.revision := old.revision;
  end if;
  return new;
end $$;
create trigger wo_social_stat_revision before update on wo_social_stat
  for each row execute function wo_social_stat_revised();

alter table wo_social_alias add column revision bigint not null default nextval('wo_social_revision_seq');
create function wo_social_alias_revised() returns trigger language plpgsql as $$
begin
  if row(new.owner_key,new.platform_id,new.provider,new.observed_at,new.verified_at,new.invalidated_at)
     is distinct from row(old.owner_key,old.platform_id,old.provider,old.observed_at,old.verified_at,old.invalidated_at) then
    new.revision := nextval('wo_social_revision_seq');
  else new.revision := old.revision;
  end if;
  return new;
end $$;
create trigger wo_social_alias_revision before update on wo_social_alias
  for each row execute function wo_social_alias_revised();

create table wo_social_snapshot (
  version bigint primary key default nextval('wo_social_revision_seq'),
  identity_key text not null references wo_social_stat(stat_key),
  network text not null check (network in ('facebook','instagram','tiktok','youtube')),
  platform_id text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  fetched_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index wo_social_snapshot_identity on wo_social_snapshot(identity_key,version desc);
create function wo_social_snapshot_immutable() returns trigger language plpgsql as $$
begin raise exception 'Social snapshots are immutable'; end $$;
create trigger wo_social_snapshot_immutable before update or delete on wo_social_snapshot
  for each row execute function wo_social_snapshot_immutable();

-- Service credentials grant social read/refresh only. A deployment owns quota across key rotation.
create table wo_social_deployment (
  deployment_id text primary key,
  origin text not null,
  enabled boolean not null default false,
  reads_per_minute integer not null default 0 check (reads_per_minute between 0 and 10000),
  refreshes_per_day integer not null default 0 check (refreshes_per_day between 0 and 10000),
  forces_per_day integer not null default 0 check (forces_per_day between 0 and 10000),
  created_at timestamptz not null default now()
);
create table wo_social_service_key (
  key_id text primary key,
  deployment_id text not null references wo_social_deployment(deployment_id),
  secret_hash text not null,
  scopes text[] not null check (scopes <@ array['read','refresh']::text[]),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- One durable operation per handle, with its target captured before any queue side effect.
create table wo_social_operation (
  op_key text primary key,
  deployment_id text not null references wo_social_deployment(deployment_id),
  operation_id uuid not null,
  request_hash text not null,
  network text not null,
  url text not null,
  alias_key text not null,
  force boolean not null,
  target_key text not null,
  binding_revision bigint,
  target_generation bigint,
  target_exists boolean not null,
  admitted_generation bigint,
  admission text,
  status text not null default 'queued',
  error text,
  queued_at timestamptz not null,
  attempts integer not null default 0,
  lease_until timestamptz,
  lease_token bigint not null default 0,
  checked_at timestamptz,
  created_at timestamptz not null,
  unique(deployment_id,operation_id)
);
create index wo_social_operation_queue on wo_social_operation(status,queued_at);

-- Replicas never own provider jobs. Their authority pin prevents mixing unrelated version epochs.
create table wo_social_replica_authority (
  origin text primary key,
  authority_id uuid not null,
  pinned_at timestamptz not null,
  unique(origin,authority_id)
);
create table wo_social_replica_identity (
  origin text not null,
  authority_id uuid not null,
  identity_key text not null,
  network text not null,
  platform_id text not null,
  version bigint not null,
  snapshot jsonb not null,
  fetched_at timestamptz not null,
  synced_at timestamptz not null,
  primary key(origin,authority_id,identity_key),
  foreign key(origin,authority_id) references wo_social_replica_authority(origin,authority_id)
);
create table wo_social_replica_alias (
  origin text not null,
  authority_id uuid not null,
  alias_key text not null,
  identity_key text,
  binding_revision bigint not null default 0,
  observed_at timestamptz,
  verified_at timestamptz,
  invalidated_at timestamptz,
  state jsonb not null default '{}',
  state_revision bigint not null default 0,
  state_observed_at timestamptz not null,
  synced_at timestamptz not null,
  primary key(origin,authority_id,alias_key),
  foreign key(origin,authority_id) references wo_social_replica_authority(origin,authority_id)
);
create table wo_social_outbox (
  outbox_key text primary key,
  origin text not null,
  authority_id uuid not null,
  expected_fence jsonb,
  operation_id uuid not null,
  alias_key text not null,
  network text not null,
  url text not null,
  force boolean not null,
  status text not null default 'queued',
  error text,
  remote_result jsonb,
  queued_at timestamptz not null,
  next_retry_at timestamptz,
  attempts integer not null default 0,
  lease_until timestamptz,
  lease_token bigint not null default 0,
  checked_at timestamptz,
  unique(origin,operation_id)
);
create unique index wo_social_outbox_pending on wo_social_outbox(origin,alias_key) where status='queued';

-- A place remains local; only a server-verified local source may acquire a shared identity link.
create table wo_place_social_link (
  place_id uuid not null,
  kind text not null,
  url text not null,
  origin text not null,
  authority_id uuid not null,
  identity_key text not null,
  binding_revision bigint not null,
  alias_key text not null,
  verified_at timestamptz not null,
  revoked_at timestamptz,
  primary key(place_id,kind,url),
  foreign key(place_id,kind,url) references wo_place_link(place_id,kind,url)
);
