-- A backup point packed for its Owner to download (11/10/2026, `tasks/todo-backup-export.md`,
-- `sites/backup-export.js`). One row per request: the host packs the point and PUTs the zip to the
-- artifact store under `key`; this row is what says whether it got there, and until when a link to
-- it may be issued.
--
--   state        queued → packing → uploading → ready → expired, or failed from any of the first
--                three. `ready` only once the store answered HEAD with the size the host reported.
--   job_id       the host's job (`/_host/jobs/<id>`), so a row whose door stopped waiting is read
--                back from the host instead of left in flight.
--   key          `backup-exports/<site label>/<id>.zip` — a namespace of its own: the generic
--                artifact doors sign only under `sites/<label>/`, never here.
--   expires_at   ready_at + 24 h: past it no link is issued and the sweep deletes the object.
--
-- 🔒 AT MOST ONE EXPORT IN FLIGHT PER SITE: the partial unique index makes a second request while
-- one is queued, packing or uploading a conflict, whichever replica it lands on.
create table backup_export (
  id uuid primary key,
  -- No foreign key: the row outlives nothing it needs, and the site's delete removes it after the
  -- object (`forgetSite`), never before.
  site_key text not null,
  version int not null check (version between 1 and 999999),
  commit_sha text,
  requested_by uuid references account(id) on delete set null,
  requested_email text not null,
  state text not null default 'queued'
    check (state in ('queued', 'packing', 'uploading', 'ready', 'failed', 'expired')),
  job_id text,
  key text not null,
  bytes bigint,
  sha256 text,
  error text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz
);
create unique index backup_export_one_in_flight on backup_export (site_key)
  where state in ('queued', 'packing', 'uploading');
create index backup_export_account_created on backup_export (requested_by, created_at desc);
create index backup_export_expires on backup_export (expires_at) where state = 'ready';
