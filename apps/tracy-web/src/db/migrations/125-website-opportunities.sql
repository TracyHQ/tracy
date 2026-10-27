-- apps/tracy-web/src/db/migrations/125-website-opportunities.sql
-- Website Opportunities (tasks/spec-website-opportunities-contracts.md §3): a restaurant found
-- before any site exists, its collected sources and media, immutable brief revisions and the builds
-- made from them. Every row belongs to one account (`opportunities/` checks ownership on every read).
-- Expand-only: an older image ignores these tables.
--
-- wo_preference   the account's Default CMS (no row = joomla, the code default)
-- wo_opportunity  one restaurant (or one URL) an account chose to work on
-- wo_job          durable research job; claimed with a lease and a fencing token (`lease_token`)
-- wo_job_attempt  one row per claim of a job: when it ran and how it ended
-- wo_source       per source (website, facebook, …): its ref, status, resume cursor, what was collected
-- wo_media        one downloaded (or referenced) image/video, deduplicated by sha256 per opportunity
-- wo_profile      the merged business profile and the brand observations
-- wo_revision     an immutable brief snapshot: cms, template, brief JSON + Markdown, asset manifest
-- wo_build        one build request of a revision, through POST /api/sites, with its receipt
create table if not exists wo_preference (
  account_id uuid primary key references account(id) on delete cascade,
  cms text not null check (cms in ('joomla', 'wordpress', 'emdash')),
  updated_at timestamptz not null default now()
);

create table if not exists wo_opportunity (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  team_id uuid,
  name text not null,
  branch text,
  provider text not null,
  provider_id text not null,
  candidate jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider, provider_id)
);
create index if not exists wo_opportunity_account on wo_opportunity (account_id, created_at desc);

create table if not exists wo_job (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
  kind text not null check (kind in ('research', 'build')),
  request_id text not null,
  state text not null default 'queued'
    check (state in ('queued', 'running', 'paused', 'blocked', 'failed', 'cancelled', 'completed')),
  stage text not null default 'discovery',
  progress jsonb not null default '{}'::jsonb,
  lease_owner text,
  lease_token bigint not null default 0,
  lease_until timestamptz,
  heartbeat_at timestamptz,
  attempt integer not null default 0,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, request_id)
);
create index if not exists wo_job_claimable on wo_job (state, lease_until) where state in ('queued', 'running');
create index if not exists wo_job_opportunity on wo_job (opportunity_id, created_at desc);

create table if not exists wo_job_attempt (
  job_id uuid not null references wo_job(id) on delete cascade,
  attempt integer not null,
  lease_token bigint not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome text,
  error jsonb,
  primary key (job_id, attempt)
);

create table if not exists wo_source (
  opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
  source text not null,
  ref text,
  status text not null default 'pending',
  reason text,
  cursor jsonb,
  coverage jsonb,
  -- What the connector returned (profile, pages, posts, media refs), kept so a resumed job does not
  -- collect again and the media stage can run after a restart.
  collected jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (opportunity_id, source)
);

create table if not exists wo_media (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
  sha256 text not null,
  -- null when the bytes are not stored (`status` says why)
  object_key text,
  status text not null default 'stored' check (status in ('stored', 'reference')),
  reason text,
  mime text,
  bytes bigint,
  width integer,
  height integer,
  duration_s numeric,
  kind text not null check (kind in ('image', 'video')),
  category text,
  -- [{r,g,b,weight}] of a stored image, the input of the brand observation
  palette jsonb,
  source text not null,
  source_url text not null,
  post_id text,
  posted_at timestamptz,
  collected_at timestamptz not null default now(),
  unique (opportunity_id, sha256)
);
create index if not exists wo_media_source_url on wo_media (opportunity_id, source_url);

create table if not exists wo_profile (
  opportunity_id uuid primary key references wo_opportunity(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  brand jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists wo_revision (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  n integer not null,
  cms text not null check (cms in ('joomla', 'wordpress', 'emdash')),
  cms_source text not null,
  resolved_at timestamptz not null,
  template jsonb not null,
  brief jsonb not null,
  brief_md text not null,
  asset_manifest jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (opportunity_id, n)
);

create table if not exists wo_build (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  revision_id uuid not null references wo_revision(id) on delete cascade,
  request_id text not null,
  build_id uuid not null,
  site_key text,
  site_job_id text,
  state text not null default 'requesting',
  receipt jsonb,
  -- the pictures put on the site and the agent prompt (`opportunities/handoff.js`)
  handoff jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, request_id)
);
create index if not exists wo_build_revision on wo_build (revision_id);

-- A revision is a snapshot: nothing may change it after it is written.
create or replace function wo_revision_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'wo_revision is immutable';
end
$$;
drop trigger if exists wo_revision_no_update on wo_revision;
create trigger wo_revision_no_update before update on wo_revision
  for each row execute function wo_revision_immutable();
