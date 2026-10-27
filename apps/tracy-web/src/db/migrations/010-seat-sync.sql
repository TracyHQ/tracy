-- The seat book's changes that a host's dsh has to hear about, kept until it has (plan
-- first-site-build-onboarding §4, P07/P08).
--
-- A role change, a policy narrowed, a seat taken back or given up is written to `seat` first and
-- is true from that moment at every door THIS app answers (`workspace/route.js` re-reads the seat
-- and re-mints a cookie whose fingerprint moved; the Apply door reads the live grant). What that
-- write cannot reach by itself is the permission row inside a host's dsh — the folders, toolsets
-- and credential version a live session runs on. `seats/route.js` tells every configured host in
-- the same request; a host that does not answer is recorded HERE and told again by `cron.js`,
-- until it has been. An outbox, not a retry loop in the request: the request has already answered
-- the person who made the change, and a revoke reported as done must become done without anyone
-- pressing again.
create table seat_sync (
  id bigserial primary key,
  -- `revoke`: take the seat back on that host (`/gateway/seat/revoke`, site-scoped).
  -- `mint`: write the seat's CURRENT grant (`/gateway/seat/session`, the token discarded) so a
  --         live session on that host runs on the new role and toolsets at once.
  kind text not null check (kind in ('revoke', 'mint')),
  host text not null,
  email text not null,
  site_key text not null,
  -- The grant to write, for `mint`; empty for `revoke`.
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error text,
  next_at timestamptz not null default now(),
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index seat_sync_due on seat_sync (next_at) where done_at is null;
