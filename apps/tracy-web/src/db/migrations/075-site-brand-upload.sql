-- Brand pictures a customer uploads in "Customize your site" (plan `tasks/plan-ten-logo-favicon.md`,
-- T06, decision D4): the logo variants and the favicon, one file at a time, through
-- `POST /api/sites/brand-files` (`sites/brand-files.js`) BEFORE the site exists. The create press then
-- names them by id in `brief.answers.logo` / `brief.answers.favicon`, and `briefOfPress` claims each
-- one for the new site (`site_key`, `claimed_at`). The bytes live in the artifact store
-- (`ARTIFACT_S3_*`) under `object_key`; the brief run reads them back when the site is up.
--
-- 🔒 A FILE BELONGS TO THE ACCOUNT THAT UPLOADED IT. A press naming an id another account uploaded
-- drops that id; nobody builds a site with somebody else's logo by guessing ids.
--
-- A row never claimed is an upload whose sheet was closed or whose file was replaced; it is removed
-- with its object a day later (`LOOSE_TTL_MS`). A claimed row stays while the build may still read
-- it, then goes after `CLAIMED_TTL_MS`: the site keeps its own copy once the writer has put it there.
create table site_brand_upload (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references account(id) on delete cascade,
  role text not null check (role in ('logo-light', 'logo-dark', 'logo', 'favicon')),
  size integer not null check (size > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  object_key text not null unique,
  -- Set by the create press that names the file; a deleted site leaves the row to the sweep.
  site_key text references site(site_key) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index site_brand_upload_sweep on site_brand_upload (created_at);
