-- The stock of CMS instances installed BEFORE a customer asks for one, the pools they belong to,
-- and the durable refill intents that keep those pools full (tasks/todo-inventory-va-seed-theo-brief.md).
--
-- 🔒 AN INVENTORY INSTANCE IS A `site` ROW WITH NO SEAT, NOT A NEW KIND OF THING. Everything the
-- fleet already knows how to do — provision, attach, pair, tear down — is keyed off `site.label`
-- and `site.site_key`, and a second representation would mean a second copy of all of it. So stock
-- reuses the row and this table carries ONLY what the row cannot say: which pool, which state in
-- the preparation ladder, which generation it was built at, and who it is being handed to.
--
-- 🔒 WHY NOT `demo = true`. A demo is claimed by nobody AND is marketing: `liveDemosByTag` feeds
-- template cards, `sweepDemos` may tear one down and redeploy it without asking, and Ops lists it
-- under Demos. Stock must survive all three (016-demo-sites.sql says as much about a customer's
-- copy). So stock rows keep `demo = false` and are found through THIS table instead.
--
-- 🔒 WHAT KEEPS STOCK OUT OF A CUSTOMER'S SIGHT, measured rather than asserted: `/api/sites` and
-- My Sites answer from the seat book (`seat` rows), and a stock row is prepared WITHOUT calling
-- `claimOwnership` — so it has no seat and no `created_by`, and there is no query that could
-- return it to a viewer. `site.created_by` has been nullable since 002-book.sql; this is the first
-- code that relies on that, deliberately, because "nobody owns it yet" is exactly the fact.

-- One pool per (environment, host, CMS, release generation). The policy lives here because
-- "how much stock" is an operator's decision per release, not a global constant.
create table inventory_pool (
  -- environment:host:platform:tag:version:generation — composed by code (`lib/inventory-pool-key.js`)
  -- so every reader spells it one way. Composite rather than a hash: a person reading Ops has to be
  -- able to see WHICH pool is stuck without joining anything.
  pool_key text primary key,
  environment text not null,
  host text not null,
  platform text not null,
  quickstart_tag text not null,
  quickstart_version text not null,
  -- sha256 over the release identity a prepare was run at: the install entry's per-part checksums,
  -- the contract id and minimum Claude Cowork plugin version, and the verifier version. An instance prepared at another
  -- generation is not interchangeable with this pool's, whatever its tag says.
  generation text not null,
  -- 🔒 DEFAULT OFF, PER POOL. §7: rollout is a feature flag per env/CMS/release, and a pool that
  -- appears because a release was published must not start installing on its own.
  enabled boolean not null default false,
  low_watermark integer not null default 0,
  target_ready integer not null default 1,
  max_stock integer not null default 3,
  max_concurrent_prepares integer not null default 1,
  -- When true a machine-verified instance stops at `awaiting_review` instead of `ready`, until an
  -- administrator approves THIS generation (`inventory_generation_approval`). Off by default: §3
  -- says a successful demo is the eligibility, and a second mandatory human gate was not asked for.
  review_hold boolean not null default false,
  max_attempts integer not null default 3,
  -- How long a `ready` instance's health check stands before it must be taken again.
  health_ttl_seconds integer not null default 86400,
  -- Set together: refill stops and Ops can say why. Null reason with paused = true is refused by
  -- the store, because "paused, no reason" is the state nobody can act on.
  paused boolean not null default false,
  paused_reason text,
  updated_by text,
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  constraint inventory_pool_paused_reason check (not paused or paused_reason is not null),
  constraint inventory_pool_bounds check (
    low_watermark >= 0 and target_ready >= 1 and max_stock >= target_ready
      and max_concurrent_prepares >= 1 and max_attempts >= 1 and health_ttl_seconds > 0
      and low_watermark <= target_ready
  )
);

-- One row per prepared instance. The ladder in §3 of the task, verbatim:
--   queued → preparing → verifying → (awaiting_review →) ready → reserved → assigning → assigned
--   failure → quarantined;  ready/awaiting_review → draining → retired
create table inventory_instance (
  id uuid primary key default gen_random_uuid(),
  pool_key text not null references inventory_pool (pool_key) on delete restrict,
  -- 🔒 THE SITE ROW IS WRITTEN FIRST AND THE KEY NEVER CHANGES (§3). `site_key`/`label` exist before
  -- the host is called and survive the handover to a customer — renaming at claim time would break
  -- the folder, the container and every idempotency fingerprint that names them.
  site_key text not null unique references site (site_key) on delete cascade,
  label text not null,
  host text not null,
  -- Copied from the pool at insert so an instance keeps saying what it was built at even after the
  -- pool row moves to a newer release. This is what a drain compares.
  generation text not null,
  state text not null default 'queued' check (state in (
    'queued', 'preparing', 'verifying', 'awaiting_review', 'ready',
    'reserved', 'assigning', 'assigned',
    'draining', 'retired', 'quarantined'
  )),
  -- The tracy-host job of the current attempt. Null before the host has answered.
  job_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  -- The machine check (§3 `ready` means health/compatibility still valid), and when it was taken.
  health_ok boolean,
  health_checked_at timestamptz,
  health_detail jsonb,
  -- Artifact/contract/Claude Cowork plugin hashes as they were READ BACK off this instance, not as the release
  -- promised them. `approve` compares against these.
  hashes jsonb not null default '{}'::jsonb,
  -- Who this instance is being handed to. Written inside the claim transaction; the pair is unique
  -- so a retry of the same (account, build) finds its own instance rather than taking a second.
  reserved_account uuid references account (id) on delete set null,
  reserved_build text,
  reserved_at timestamptz,
  -- 🔒 MONOTONIC PER INSTANCE, BUMPED ON EVERY RESERVATION (§5). Host/seat/session side effects run
  -- outside the DB transaction; a worker that resumed after a reservation was released must be
  -- refused by the token it still carries, not by a timestamp it can re-read as fresh.
  fencing_token bigint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_instance_supply on inventory_instance (pool_key, state);
-- One live reservation per (account, build): the retry of a create request must converge on the
-- instance it already took. Retired/quarantined rows keep their columns as history and are excluded.
create unique index inventory_instance_reservation
  on inventory_instance (reserved_account, reserved_build)
  where reserved_account is not null and state in ('reserved', 'assigning', 'assigned');
create index inventory_instance_retry on inventory_instance (next_attempt_at)
  where state in ('queued', 'quarantined');

-- The refill outbox. Same shape as `seat_sync` (010), for the same reason: a row written inside the
-- transaction that CAUSED the deficit, drained by whoever gets there first.
--
-- 🔒 THE KEY IS THE DEDUPE (§4 rule 5). `pool_key:<n>` where n is the slot this intent fills, so an
-- event and two cron replicas racing on the same deficit write the same primary key and exactly one
-- survives. Without it, "R=1, P=1, target=3" enqueues one job three times.
create table inventory_refill_intent (
  job_key text primary key,
  pool_key text not null references inventory_pool (pool_key) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  next_at timestamptz not null default now(),
  -- The instance this intent produced, once it has one. Kept after `done` so a reconciler can tell
  -- "this intent was honoured" from "this intent was lost".
  instance_id uuid references inventory_instance (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_refill_due on inventory_refill_intent (next_at) where state in ('pending', 'running');

-- An administrator's approval of one GENERATION of one pool (§3). Approving lets every later refill
-- at the same generation go `verifying → ready` on the machine check alone; a new hash is a new
-- generation and needs its own approval.
create table inventory_generation_approval (
  pool_key text not null references inventory_pool (pool_key) on delete cascade,
  generation text not null,
  -- 🔒 THE APPROVAL NAMES WHAT WAS SEEN (§3 "the approve door uses the expected hash/revision"). An approve
  -- posted from a screen that was looking at an older instance is refused, not applied blind.
  expected_hashes jsonb not null,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  primary key (pool_key, generation)
);

-- What a demo install ATTESTED, read off job evidence rather than off a screen (§1 eligibility).
--
-- 🔒 WHY THIS IS WRITTEN DOWN AND NOT ONLY COMPUTED. `upsertDemoSite` (lib/demo-sites.js:24) rewrites
-- `site.quickstart_version`/`_sha256` in place at the START of every install attempt, so after a
-- failed redeploy the row names a release that never installed. Measured on the local stand 22/09:
-- `business-emdash` and `saas-emdash` carry version 1.0.0 on the row with `provision` jobs in state
-- `failed` and none `done` — a reader that trusted the row would have called both eligible. The
-- attestation is therefore recorded when a provision job is SEEN to reach `done`, and it names the
-- version that job ran at, taken from its own job key (`demo:<label>:<version>:<n>`) when present.
create table demo_install_attestation (
  quickstart_tag text not null,
  quickstart_version text not null,
  site_key text not null,
  job_id text not null,
  -- 'job-key' when the version came from the job's own key, 'site-row' when the key carried none
  -- (the redeploy shape is `demo:<label>:redeploy:<jobId>`) and the row was the only source left.
  -- A reader may treat the second as weaker evidence; it is never treated as none.
  version_source text not null check (version_source in ('job-key', 'site-row')),
  sha256 text,
  attested_at timestamptz not null default now(),
  primary key (quickstart_tag, quickstart_version, job_id)
);
create index demo_attestation_tag on demo_install_attestation (quickstart_tag, attested_at desc);
