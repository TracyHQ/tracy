-- WHO IS WRITING THIS SITE RIGHT NOW — one row per site, and the "one row" is the whole design.
--
-- Two chat sessions on one site both reach POST /api/sites/:key/apply, which relays to the same
-- component and the same database row. Last write wins, silently, and neither agent knows the other
-- exists. This table is what makes the second one an answer instead of an overwrite.
--
-- 🔒 KEYED ON site_key ALONE, NOT ON (site_key, session_id). A table keyed per session gives every
-- claimant its OWN row, and then two racing `update … where not exists (a live holder)` statements
-- lock different rows, see each other's pre-image under READ COMMITTED, and both win. Keyed on the
-- site there is exactly one row to contend for, so `insert … on conflict (site_key) do update …
-- where <free>` is decided by Postgres's row lock — the same property `takeOverCreation` relies on
-- (sites/store.js), and the reason that one is correct.
--
-- 🔒 NO INDEX ON `audit` HERE. An earlier draft added `create index audit_site_at on audit
-- (site_key, at desc)` to answer "who wrote recently". Migrations run inside a transaction under an
-- advisory lock, before the server listens (db/index.js), so `create index concurrently` is illegal
-- and the plain form takes a SHARE lock on the whole of `audit` — and a migration that fails means
-- tracy-web does not boot, for every customer. Everything needed is in this table.
create table if not exists site_write_lease (
  site_key    text primary key,
  -- Who holds it. `holder_session` is the dsh session; `holder_actor` the person, for the message
  -- the other customer reads. Both null when the lease is free.
  holder_session text,
  holder_actor   text,
  -- When this holder first took it, and when it last WROTE. Two clocks on purpose: a holder that is
  -- only reading is not working on the site, and a reader's activity must not extend a write lease.
  taken_at    timestamptz,
  wrote_at    timestamptz,
  -- Non-null from the first moment a session is seen, so ordering never compares against NULL.
  -- `wanted_at` is the queue ticket of whoever is waiting; a NULL ticket in an earlier draft made a
  -- brand-new session outrank every session already waiting, because `x < NULL` is NULL and
  -- `not exists` was therefore true.
  wanted_session text,
  wanted_actor   text,
  wanted_at      timestamptz,
  updated_at  timestamptz not null default now()
);

-- Every apply, read or write, from any session, so the door can say who ELSE is here even when
-- nobody holds the lease. Separate from the lease because presence is per session and the lease is
-- per site, and merging them is what forced the per-session key that broke atomicity.
create table if not exists site_presence (
  site_key   text not null,
  session_id text not null,
  actor      text,
  -- First seen in this contention episode, and last seen at all. `first_at` is the arrival stamp the
  -- product rule ("whoever arrived first goes first") is decided on; it is reset when a session has
  -- been away longer than the stale window, so a chat from last Monday cannot outrank one from today.
  first_at   timestamptz not null default now(),
  seen_at    timestamptz not null default now(),
  primary key (site_key, session_id)
);

create index if not exists site_presence_site_seen on site_presence (site_key, seen_at desc);
