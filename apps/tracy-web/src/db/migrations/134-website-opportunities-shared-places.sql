-- apps/tracy-web/src/db/migrations/134-website-opportunities-shared-places.sql
-- Research shared across accounts (tasks/todo-wo-shared-research.md P1): a restaurant researched once
-- is reused by every account that saves it. The PLACE owns what was collected (sources, public profile,
-- pictures); the OPPORTUNITY keeps what is the account's own (its candidate overlay, briefs, builds).
-- Tracy runs and pays for the shared store; no account owns a place.
--
-- wo_place                 one real-world place; `current_snapshot_id` is what every reader shows
-- wo_place_identity        how a place is recognised: (namespace, external_id) → place. Namespaces:
--                          google (google-places and google-maps share Google place ids), osm (type/id),
--                          url (a pasted address, normalised), merge (history of a merge, P3)
-- wo_place_link            place → public source with evidence. Only the server adds rows: the
--                          identity itself (`identity`), Google Place Details' websiteUri (`google`), a
--                          social page the place's own website links to (`website`). A URL a client sent
--                          never becomes a link of another place: it stays a private source of that
--                          opportunity (`wo_source`). Several places may share one url.
-- wo_place_job             ONE research run of a place, leased and fenced like `wo_job` (lease_token).
--                          At most one running and one queued per place: a Force while running is at
--                          most ONE next run. `snapshot_id` is the snapshot this run prepares.
-- wo_place_snapshot        a versioned result: preparing → published (atomically, in the transaction
--                          that checks the lease and moves `current_snapshot_id`) | failed; a published
--                          one becomes superseded when the next is published. A failed refresh leaves
--                          the current one in place.
-- wo_place_snapshot_source per source of a snapshot: what was collected, `collected_at` = the last
--                          SUCCESSFUL collection (freshness), `attempted_at` = the last try, `last_error`
--                          of a try that failed while older data was kept
-- wo_place_snapshot_media  which place media a snapshot shows
-- wo_place_snapshot_profile the snapshot's public profile and brand observation (no candidate overlay)
-- wo_place_media           one picture/video of a place, deduplicated by sha256, object key
--                          `places/<place id>/<sha256>.<ext>`. Provenance on every row (source,
--                          source_url, provider, credit, collected_at, job_id). Immutable but for
--                          revoke (`revoked_at`, `revoke_reason`): a revoked row is never built or
--                          handed off again. 19/10/2026: every picture is kept, Google and social
--                          ones included; the legal team decides takedowns, the revoke columns are its way.
-- wo_media_analysis        vision labels by (media sha256, model, version): claimed before the model is
--                          called, so two builds never pay twice for one picture
--
-- wo_opportunity.place_id         the place this opportunity resolved to (null: not resolvable, or saved
--                                 before this migration and not researched since)
-- wo_job.place_job_id             a research REQUEST of an opportunity served by that place job; its
--                                 state mirrors the place job's, written in the same transactions
-- wo_job.result_snapshot_id       the snapshot that answered the request
-- wo_revision.place_snapshot_id   the snapshot a brief was made from; `profile_effective` the profile it
--                                 read (snapshot + the account's overlay); its asset manifest names
--                                 `wo_place_media` rows by id and sha256 (`origin: 'place'`). Revisions
--                                 made before this keep naming `wo_media` and read it as before.
--
-- Expand-only: nothing existing is rewritten. An older image ignores the new tables and columns.
create table if not exists wo_place (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  current_snapshot_id uuid,
  merged_into uuid references wo_place(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wo_place_identity (
  namespace text not null check (namespace in ('google', 'osm', 'url', 'merge')),
  external_id text not null,
  place_id uuid not null references wo_place(id),
  -- the provider the identity was first seen from (google-places, google-maps, osm, url)
  source text not null,
  confidence real not null default 1,
  created_at timestamptz not null default now(),
  primary key (namespace, external_id)
);
create index if not exists wo_place_identity_place on wo_place_identity (place_id);

create table if not exists wo_place_link (
  place_id uuid not null references wo_place(id),
  kind text not null check (kind in ('website', 'facebook', 'instagram', 'tiktok', 'youtube')),
  url text not null,
  verified_by text not null check (verified_by in ('identity', 'google', 'website', 'operator')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (place_id, kind, url)
);
create index if not exists wo_place_link_url on wo_place_link (kind, url);

create table if not exists wo_place_job (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references wo_place(id),
  state text not null default 'queued'
    check (state in ('queued', 'running', 'paused', 'blocked', 'failed', 'cancelled', 'completed')),
  stage text not null default 'discovery',
  progress jsonb not null default '{}'::jsonb,
  -- collect every source again, fresh or not
  force boolean not null default false,
  snapshot_id uuid,
  lease_owner text,
  lease_token bigint not null default 0,
  lease_until timestamptz,
  heartbeat_at timestamptz,
  attempt integer not null default 0,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wo_place_job_one_running on wo_place_job (place_id) where state = 'running';
create unique index if not exists wo_place_job_one_queued on wo_place_job (place_id) where state = 'queued';
create index if not exists wo_place_job_claimable on wo_place_job (state, updated_at)
  where state in ('queued', 'running');
create index if not exists wo_place_job_place on wo_place_job (place_id, created_at desc);

create table if not exists wo_place_snapshot (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references wo_place(id),
  state text not null default 'preparing' check (state in ('preparing', 'published', 'failed', 'superseded')),
  job_id uuid references wo_place_job(id),
  -- the published snapshot this one started from (its sources and media were carried over)
  base_snapshot_id uuid references wo_place_snapshot(id),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists wo_place_snapshot_place on wo_place_snapshot (place_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wo_place_current_snapshot_fk' and conrelid='wo_place'::regclass) then
    alter table wo_place add constraint wo_place_current_snapshot_fk
      foreign key (current_snapshot_id) references wo_place_snapshot(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wo_place_job_snapshot_fk' and conrelid='wo_place_job'::regclass) then
    alter table wo_place_job add constraint wo_place_job_snapshot_fk
      foreign key (snapshot_id) references wo_place_snapshot(id);
  end if;
end
$$;

create table if not exists wo_place_snapshot_source (
  snapshot_id uuid not null references wo_place_snapshot(id),
  source text not null,
  ref text,
  status text not null default 'pending',
  reason text,
  cursor jsonb,
  coverage jsonb,
  collected jsonb not null default '{}'::jsonb,
  collected_at timestamptz,
  attempted_at timestamptz,
  last_error jsonb,
  collector_version text,
  primary key (snapshot_id, source)
);

create table if not exists wo_place_snapshot_profile (
  snapshot_id uuid primary key references wo_place_snapshot(id),
  profile jsonb not null default '{}'::jsonb,
  brand jsonb
);

create table if not exists wo_place_media (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references wo_place(id),
  sha256 text not null,
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
  palette jsonb,
  caption text,
  alt text,
  dhash text,
  -- measured features only ({features}); vision labels live in wo_media_analysis
  labels jsonb,
  source text not null,
  source_url text not null,
  post_id text,
  posted_at timestamptz,
  -- who served it (Google, Apify, the website itself) and the credit its licence asks for
  provider text,
  credit jsonb,
  job_id uuid references wo_place_job(id),
  collected_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  unique (place_id, sha256)
);
create index if not exists wo_place_media_source_url on wo_place_media (place_id, source_url);

-- A brief pins media by id and sha256: a row may be revoked, never changed or deleted.
create or replace function wo_place_media_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wo_place_media rows are never deleted (revoke them)';
  end if;
  if (to_jsonb(new) - 'revoked_at' - 'revoke_reason') <> (to_jsonb(old) - 'revoked_at' - 'revoke_reason') then
    raise exception 'wo_place_media is immutable except revoked_at and revoke_reason';
  end if;
  return new;
end
$$;
drop trigger if exists wo_place_media_immutable on wo_place_media;
create trigger wo_place_media_immutable before update or delete on wo_place_media
  for each row execute function wo_place_media_guard();

create table if not exists wo_place_snapshot_media (
  snapshot_id uuid not null references wo_place_snapshot(id),
  media_id uuid not null references wo_place_media(id),
  primary key (snapshot_id, media_id)
);

create table if not exists wo_media_analysis (
  media_sha256 text not null,
  model text not null,
  -- the model, prompt, schema and preprocessing key (`lib/picture-vision.js` visionKey)
  version text not null,
  state text not null default 'pending' check (state in ('pending', 'done', 'failed')),
  result jsonb,
  lease_until timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (media_sha256, model, version)
);

alter table wo_opportunity add column if not exists place_id uuid references wo_place(id);
create index if not exists wo_opportunity_place on wo_opportunity (place_id) where place_id is not null;
alter table wo_job add column if not exists place_job_id uuid references wo_place_job(id);
alter table wo_job add column if not exists result_snapshot_id uuid references wo_place_snapshot(id);
create index if not exists wo_job_place_job on wo_job (place_job_id) where place_job_id is not null;
alter table wo_revision add column if not exists place_snapshot_id uuid references wo_place_snapshot(id);
alter table wo_revision add column if not exists profile_effective jsonb;
