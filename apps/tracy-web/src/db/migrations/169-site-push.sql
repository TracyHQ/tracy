-- "Sync to live" for an imported site (`sites/live-push.js`, plan tasks/ke-hoach-sync-to-live.md):
-- one row per push, from its preview to its undo. The preview, the writes through the live site's
-- Claude Cowork engine and the undo run on the site's host (`webroot-live-push.sh`); this row is what
-- tracy-web knows of them.
--
--   state      running | previewed | held | pushed | undone | failed
--   phase      preview | apply | undo: which of the three the state belongs to (a `running` push is
--              running that phase; a `failed` one failed in it)
--   step       the host job's step while it runs
--   host_job   the host's job id of the phase under way
--   preview    the host's preview answer: the changes grouped (add, change, remove), what phase 1
--              cannot push yet, and what the live site changed since the last sync
--   result     the host's apply answer: what was pushed, what was skipped as a conflict
--   undo       the host's undo answer: what was put back, what the live site changed since
--   deletes    whether the Owner ticked the preview's removals at confirm (none is pushed otherwise)
--   expires_at a preview is pushed within this, or previewed again
-- No token, no address: the live door's token stays in `site_component` and travels to the host only.
create table if not exists site_push (
  id uuid primary key,
  site_key text not null,
  state text not null check (state in ('running', 'previewed', 'held', 'pushed', 'undone', 'failed')),
  phase text not null check (phase in ('preview', 'apply', 'undo')),
  step text,
  host_job text,
  preview jsonb,
  result jsonb,
  undo jsonb,
  deletes boolean not null default false,
  error text,
  undo_error text,
  expires_at timestamptz,
  created_by text,
  pushed_by text,
  undone_by text,
  pushed_at timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_push_site on site_push (site_key, created_at desc);
-- Who ran a sync: `sync` — a Sync from live press; `push` — the Sync from live a Sync to live runs
-- before its preview and after its apply or undo (`live-push.js` recordSync). Both are the site's
-- syncs alike: the Sync from live dialog reads the newest of either.
alter table site_sync add column if not exists origin text not null default 'sync';
