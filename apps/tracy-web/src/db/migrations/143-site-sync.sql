-- "Sync from live" for an imported site (`sites/live-sync.js`, plan tasks/ke-hoach-dong-bo-tu-live.md):
-- one row per sync. The read of the live site, the merge and the apply run on the site's host
-- (`webroot-sync.sh`); this row is what tracy-web knows of it.
--
--   state         running | needs_resolution | applied | failed
--   step          the host job's step while it runs (reading, merging, applying)
--   host_job      the host's job id, read back while the row is `running`
--   answer        the host's last answer: counts, conflicts with their three values, the backup point
--   decisions     {<conflict id>: 'ours' | 'theirs'}, kept across the merges of one sync
--   live_read_at  when the live site was read: the moment the copy holds the customer's work up to
-- No token, no address: the live door's token stays in `site_component` and travels to the host only.
create table if not exists site_sync (
  id uuid primary key,
  site_key text not null,
  state text not null check (state in ('running', 'needs_resolution', 'applied', 'failed')),
  step text,
  host_job text,
  answer jsonb,
  decisions jsonb not null default '{}'::jsonb,
  error text,
  live_read_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_sync_site on site_sync (site_key, created_at desc);
