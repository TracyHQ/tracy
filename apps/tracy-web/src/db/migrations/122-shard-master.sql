-- The master half of the shard beta (docs/sre/2026-10-15-shard-beta-design.md §1, §3.2, §4, §5;
-- docs/sre/hop-dong-cua-shard.md §8): the shards this master adopts people into, where each person,
-- site and own domain lives, the labels held across every shard, and the events each shard has
-- already delivered.

-- One row per shard, the columns of contract §8. `s0` is never a row: it is this master itself. The
-- secret is sealed by `lib/secret-box.js` (a key derived from SESSION_SECRET).
create table shard (
  name text primary key check (name ~ '^[a-z][a-z0-9]{0,15}$' and name <> 's0'),
  origin text not null unique,
  secret_box text not null,
  tunnel_id text not null check (tunnel_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  provider text,
  region text not null default 'unknown' check (region in ('asia', 'america', 'europe', 'unknown')),
  accepting boolean not null default false,
  max_sites integer not null default 200 check (max_sites > 0),
  -- The site count of the last heartbeat; null when the shard could not read its own status.
  sites integer,
  -- Held at these tags: the check door answers them with `hold` and reason PINNED (spec §5).
  pinned_app_tag text check (pinned_app_tag ~ '^[A-Za-z0-9_.-]{1,128}$'),
  pinned_dsh_tag text check (pinned_dsh_tag ~ '^[A-Za-z0-9_.-]{1,128}$'),
  -- Tags answered instead of this master's own, to test an update without redeploying the master.
  target_app_tag text check (target_app_tag ~ '^[A-Za-z0-9_.-]{1,128}$'),
  target_dsh_tag text check (target_dsh_tag ~ '^[A-Za-z0-9_.-]{1,128}$'),
  -- When the last heartbeat arrived, and what it said (the fields the check door keeps).
  last_seen_at timestamptz,
  last_heartbeat jsonb,
  migration_head text,
  -- When the check door last let this shard start an update (spec §5: at most K = 2 at once; the
  -- turn lapses fifteen minutes after it was given unless the shard says it is updating).
  update_granted_at timestamptz,
  -- Passed over for new people until then: a refused adopt, a heartbeat without its counts. The next
  -- good heartbeat clears it.
  degraded_until timestamptz,
  -- W1's own, outside contract §8: low-memory heartbeats in a row (three close the shard).
  low_mem_beats integer not null default 0,
  created_at timestamptz not null default now()
);

-- Where a person lives: `s0` = this master, anything else a shard. One person may live on several
-- shards (an invitation into another shard's site, spec §2.2; a full shard, contract §12). A
-- brand-new account has NO row until a shard adopts it: that absence is the spec's "shard = null".
-- `source` says who wrote the row: this master, or a shard's `account.created` — `invitation` lets the
-- beta gate admit a person invited on a shard (`lib/beta-access.js` `pendingInvites`).
create table directory_email (
  email text not null,
  shard text not null,
  source text not null default 'master' check (source in ('master', 'adopt', 'invitation', 'seed')),
  created_at timestamptz not null default now(),
  used_at timestamptz not null default now(),
  primary key (email, shard)
);
-- Everyone who exists before shards stays on this master (spec §2.2: s0 is never redirected).
insert into directory_email (email, shard) select email, 's0' from account on conflict do nothing;

create table directory_site (
  site_key text primary key,
  label text not null unique,
  shard text not null references shard(name),
  platform text,
  dns_state text not null default 'pending' check (dns_state in ('pending', 'ok', 'conflict', 'removing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table directory_domain (
  domain text primary key,
  site_key text not null,
  shard text not null references shard(name),
  hostname_id text,
  created_at timestamptz not null default now()
);

-- A label held for a site being created or renamed, by a shard or by this master (`s0`), until the
-- site exists (`site.created`, or this master's own `site` row) or the hold lapses.
create table label_registry (
  label text primary key,
  holder text not null,
  site_key text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Every event a shard delivered, answered once (spec §4.4: idempotent by eventId, per shard; contract
-- §5: `eventId` is 32 hex, `at` is when the shard wrote it).
create table shard_event (
  shard text not null references shard(name),
  event_id text not null check (event_id ~ '^[0-9a-f]{32}$'),
  kind text not null,
  sent_at timestamptz not null,
  status integer not null,
  outcome jsonb not null,
  received_at timestamptz not null default now(),
  primary key (shard, event_id)
);
