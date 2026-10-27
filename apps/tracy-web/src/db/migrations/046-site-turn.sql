-- WHO CHATTED WHAT WITH TRACY ON A SITE, AND WHAT EACH CHAT TURN WROTE (site changes plan §5, Q2).
--
-- Three tables, one row per thing that happened, so the Site changes tab (`sites/activity.js`, P1)
-- reads its rows from Postgres, never from a scan of `audit`. In this first version the tab still
-- reads the webroot's Git on every page too — undo/restore commits and moments recorded before this
-- table (or by an older dsh) exist only there; the aim is to stop doing that step by step:
--
--   site_turn     one chat turn of one person on one site. Opened by the host dsh's site-tabs
--                 plugin when the person's message enters the turn (`POST /api/sites/:key/turn`),
--                 closed when the turn stops (`POST /api/sites/:key/moment` with `turnId`). The name
--                 and the words of the row are this row's `actor` and `title`: the commit is authored
--                 `Agent`, and before this table the person's name lived only in `audit`.
--   site_write    one content write the turn made outside Git: through the Apply door (WordPress,
--                 Joomla) or reported on `POST /changed` (EmDash's MCP, a look edit). Written in the
--                 SAME statement as its `audit` row.
--   site_outside  one Git commit made outside any chat turn: a seal of what changed on the site, a
--                 deploy rewriting `tracy-access.php`, housekeeping. Keyed by sha, so the same commit
--                 reported twice (the next turn's seal lists recent ones) is one row.
--
-- 🔒 A turn's id is `<dsh session id>:<turn number>` (`tasks/evidence/site-changes/P0/turn-id.md`):
-- the number survives a dsh restart, and a fork gets a new session id. A write is joined to its turn
-- by that id ONLY — never by time (plan invariant 8). `site_write.turn_id` is null when the dsh that
-- made the call predates the header: P1 shows it as "unknown turn".
--
-- 🔒 No index on `audit` (023-site-write-lease.sql: migrations run in one transaction before the
-- server listens). These tables are new, so indexing them costs nothing.
create table if not exists site_turn (
  turn_id           text primary key,
  site_key          text not null,
  session_id        text not null,
  turn              integer not null,
  -- The verified email of the person whose message opened the turn (the gate's signed assertion).
  actor             text not null,
  title             text not null,
  -- `panel` (typed in the chat) or `comment` (sent from a comment, "Send to Tracy").
  source            text not null default 'panel',
  -- The dsh `user/message` id, and the prompt RPC's request id: `site_request(session_id,
  -- request_id)` finds the comment a turn came from.
  prompt_message_id text,
  rpc_id            text,
  -- Somebody typed again while the turn was running (a steer): the key is still the turn.
  steered           boolean not null default false,
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  -- `open` → `closed` at its moment; an `open` row older than 30 minutes is `stale` (dsh died).
  state             text not null default 'open',
  -- The turn's last moment commit, and how many files its moments committed (0: wrote no file).
  head_sha          text,
  files             integer not null default 0,
  -- The seal at the start of the turn did not run: files dirty before it may sit in its moment.
  unsealed_start    boolean not null default false,
  -- Another conversation's turn was open on the site at the same time (plan §4, a declared limit).
  concurrent        boolean not null default false
);

create index if not exists site_turn_site_opened on site_turn (site_key, opened_at desc);
create index if not exists site_turn_open on site_turn (site_key) where state = 'open';

create table if not exists site_write (
  id         bigserial primary key,
  site_key   text not null,
  at         timestamptz not null default now(),
  turn_id    text,
  session_id text,
  actor      text,
  action     text not null,
  -- `ok`: the source said it wrote. `refused`: the source refused cleanly, nothing written.
  -- `unknown`: no readable answer, so the write may well have landed (P0 audit-detail.md §4).
  outcome    text not null,
  -- `{kind, id, fields}` read off the call's params — names only, never a value.
  target     jsonb,
  -- `apply` (the Apply door), `emdash-mcp`, `file-look`, `look-revert` (`/changed`).
  via        text not null default 'apply'
);

create index if not exists site_write_site_at on site_write (site_key, at desc);
create index if not exists site_write_turn on site_write (turn_id) where turn_id is not null;

create table if not exists site_outside (
  sha        text not null,
  site_key   text not null,
  -- The commit's own time (Git, to the second), not when tracy-web heard of it.
  at         timestamptz not null default now(),
  files      integer not null default 0,
  -- `seal` · `deploy` · `housekeeping`
  cause      text not null default 'seal',
  deploy_tag text,
  primary key (site_key, sha)
);

create index if not exists site_outside_site_at on site_outside (site_key, at desc);
