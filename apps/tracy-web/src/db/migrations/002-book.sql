-- The seat book and the site book. Column names follow workers/seat-registry/schema.sql so the
-- one-time export (Plan 5) is pg_dump + rename, not a mapping.

create table identity (
  provider text not null,            -- google | github
  subject text not null,
  account_id uuid not null references account(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, subject)
);
alter table account add column display_name text, add column avatar_url text, add column language text;

create table site (
  site_key text primary key,
  label text not null unique,
  host text not null,
  platform text,                     -- joomla | wordpress | emdash
  origin text,                       -- fleet_born | migrated   (KV state:.origin)
  publish text not null default 'draft',   -- draft | published  (KV state:.publish)
  plan text,                         -- KV state:.plan
  prefix_aware boolean not null default true,   -- KV prefix:<label>
  guest_open boolean not null default false,    -- KV guest:<label>
  address text,                      -- https://<label>.<zone>/ once published
  port int,                          -- host loopback port of the site (from provision)
  repo text,                         -- TracyHQ/<label>
  repo_creator text,
  attached boolean not null default false,      -- KV attached:<label>
  created_by uuid references account(id),
  created_at timestamptz not null default now()
);

create table seat (
  site_key text not null references site(site_key) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  role text not null check (role in ('owner','admin','developer','editor')),
  -- Which door minted this grant (schema.sql:48-56): creator | github_push | platform_admin |
  -- domain. Null for a grant an invite created — an invite carries no proof of its own, it comes
  -- FROM a grant that already has one.
  created_by_proof text,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  -- First time this seat saw the grant through a listing call (schema.sql:66-69) — a distinct
  -- signal from accepted_at ("the invite reached them" vs. "they took the seat").
  seen_at timestamptz,
  accepted_at timestamptz,
  requested_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  workspace_id uuid,
  primary key (site_key, account_id)
);
-- Keeping the plan's site-first primary key (every other table in this file — site_role_policy,
-- job, audit, invite — is already keyed site-first) rather than reordering to production's
-- account/seat-first `unique (seat_id, site_key)`. This index covers the direction the PK does
-- not: "every site this account holds a seat on" (`sitesOfAccount`-shaped), which production's own
-- column order serves for free and this one otherwise would not.
create index seat_account on seat (account_id, site_key);
-- A site never loses its last living owner. Body ported from schema.sql `seat_site_keep_one_owner`
-- (workers/seat-registry/schema.sql:715-775), column names changed (account_id instead of a
-- separate seat_site.id, since our primary key already is (site_key, account_id)); logic
-- unchanged, including the two incident fixes recorded there:
--
-- 1. The advisory lock. A trigger that only counts loses the exact race it exists to stop: under
--    READ COMMITTED, two transactions revoking two different owner rows of the same site each
--    still see the other's row intact, both pass the count, and the site ends with no owner.
--    Application code cannot close this by itself — only a lock scoped to the site can.
--    `pg_advisory_xact_lock(hashtext(old.site_key))` serializes every owner-change of the SAME
--    site, so the second transaction re-counts after the first has committed.
-- 2. The teardown escape hatch. Without it, deleting a whole site fails on every site that has
--    exactly one owner (measured 28/08/2026 in production, across 34 sites) — the trigger blocks
--    the last revoke of the teardown itself. Compared by site_key, not a boolean, so a stray flag
--    set for one site cannot open the door for another. `seat_revoke_all_site_grants` below is the
--    one caller meant to set it. Nothing in apps/tracy-web calls that function yet — this
--    migration only lays the schema; whichever future site-teardown handler lands is the intended
--    caller. Production also revokes `execute` from PostgREST's `anon`/`authenticated` roles so
--    only its service-role Worker can call it; we have no such role split (this app talks to
--    Postgres as a single application role), so that grant dance has no equivalent here — trust
--    is only "which server code calls this function," and today nothing does.
create or replace function seat_keep_one_owner() returns trigger language plpgsql as $$
declare
  was_owner boolean;
  still_owner boolean;
begin
  if coalesce(current_setting('tracy.site_teardown', true), '') = old.site_key then
    return new;
  end if;

  was_owner := old.role = 'owner' and old.accepted_at is not null
    and old.revoked_at is null and old.declined_at is null;
  still_owner := new.role = 'owner' and new.accepted_at is not null
    and new.revoked_at is null and new.declined_at is null;
  if was_owner and not still_owner then
    perform pg_advisory_xact_lock(hashtext(old.site_key));
    if not exists (
      select 1 from seat
      where site_key = old.site_key
        and account_id <> old.account_id
        and role = 'owner'
        and accepted_at is not null
        and revoked_at is null
        and declined_at is null
    ) then
      raise exception 'site % must keep one owner', old.site_key using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger seat_keep_one_owner before update on seat for each row execute function seat_keep_one_owner();

-- Revoke every still-active seat of one site in one statement, telling the trigger above this is
-- a whole-site teardown. `set_config(..., true)` is transaction-local (`is_local`), so the escape
-- hatch it opens closes itself the moment this statement's transaction ends.
create or replace function seat_revoke_all_site_grants(p_site_key text)
returns setof seat language plpgsql as $$
begin
  perform set_config('tracy.site_teardown', p_site_key, true);
  return query
    update seat set revoked_at = now()
    where site_key = p_site_key and revoked_at is null
    returning *;
end;
$$;

create table site_role_policy (
  site_key text primary key references site(site_key) on delete cascade,
  policy jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table site_role_policy_history (
  id bigserial primary key, site_key text not null, policy jsonb not null, updated_by uuid, updated_at timestamptz not null default now()
);
-- Same shape as production's append-only site_role_policy, so the same index: "history of one
-- site, latest first" (schema.sql:210, `site_role_policy_site_created`).
create index site_role_policy_history_site on site_role_policy_history (site_key, updated_at desc);

create table invite (
  token_hash text primary key,
  email text not null,
  role text not null,
  site_keys text[] not null default '{}',
  workspace_id uuid,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table staff (
  account_id uuid primary key references account(id) on delete cascade,
  role text not null check (role in ('owner','admin','developer'))
);

create table job (
  id text primary key,
  site_key text not null,
  host text not null,
  kind text not null,                -- provision | webroot-* | teardown | go-live
  state text not null default 'queued',
  step text,
  detail jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_site on job(site_key, created_at desc);

create table audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text,
  action text not null,
  site_key text,
  detail jsonb
);

-- Column set restored to schema.sql:227-251 (`display_name` kept as production names it — no
-- caller in this repo reads a `name` column, so the plan's rename was gratuitous). `id` keeps our
-- own `default gen_random_uuid()` rather than production's no-default (there, desktop mints the
-- id before the row exists; here the server is the only writer). `created_by` follows this file's
-- own established key exception (see `site.created_by` above) — uuid FK to account(id), not
-- production's plain `text`, and nullable to match that same column's shape.
create table workspace (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  revenue_modes text[] not null default '{}'
    check (revenue_modes <@ array['goods', 'services', 'software', 'audience']::text[]),
  industry text check (industry is null or char_length(industry) between 1 and 120),
  -- Tracy's own staff sit in this same book as the workspace `kind = 'tracy_admin'` (schema.sql
  -- amendment A1) — read by the `/tracy-admin/*` routes this plan schedules later. `POST
  -- /workspaces` must never take `kind` from a request body: a workspace declaring itself
  -- tracy_admin is a workspace granting itself read access to the whole system.
  kind text not null default 'customer' check (kind in ('customer', 'tracy_admin')),
  created_by uuid references account(id),
  created_at timestamptz not null default now()
);
create table seat_workspace (
  workspace_id uuid not null references workspace(id) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','admin','developer','editor')),
  granted_by uuid, granted_at timestamptz not null default now(),
  -- Same meaning as seat.seen_at above — dropped from this table's first draft, restored here so
  -- workspace-level and site-level grants carry the same signal.
  seen_at timestamptz,
  accepted_at timestamptz, requested_at timestamptz, declined_at timestamptz, revoked_at timestamptz,
  primary key (workspace_id, account_id)
);
-- The reverse of the primary key's direction: "every workspace this account holds a grant on."
-- Production's equivalent table needs the opposite secondary index (`seat_workspace_workspace`,
-- schema.sql:294) because its own unique constraint leads with the account/seat side; ours leads
-- with workspace_id, so the gap is on the other side.
create index seat_workspace_account on seat_workspace (account_id);
create table workspace_site (
  workspace_id uuid not null references workspace(id) on delete cascade,
  site_key text not null references site(site_key) on delete cascade,
  primary key (workspace_id, site_key)
);
-- "Which workspace owns this site" — the primary key alone doesn't serve a site_key-led lookup.
-- Production has no equivalent gap here (`site.site_key` is itself that table's primary key, a
-- 1:1 design instead of this many-to-many join — a separate, already-flagged structural question,
-- not an indexing one).
create index workspace_site_site on workspace_site (site_key);
create table workspace_role_policy (
  workspace_id uuid primary key references workspace(id) on delete cascade,
  policy jsonb not null, updated_by uuid, updated_at timestamptz not null default now()
);

create table merge_ledger (
  site_key text not null, sha text not null, at timestamptz not null default now(), primary key (site_key, sha)
);

create table rate_bucket (
  bucket text not null, window_start timestamptz not null, count int not null default 0, primary key (bucket, window_start)
);
