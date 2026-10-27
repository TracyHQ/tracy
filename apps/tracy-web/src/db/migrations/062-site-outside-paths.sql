-- A FILE CHANGE THAT ALREADY HAS A SOURCE IS ONE ROW, NOT TWO (dev e2e 04/10/2026, E5.1c).
--
-- A WordPress plugin auto-update showed as an Automatic row ("Updated Tracy's plugin …") AND as
-- "Files changed; source unknown · 35 files"; a media upload in wp-admin as a CMS admin row AND
-- "… · 5 files". The seal of those files is folded into the CMS row that explains them
-- (`apps/tracy-web/src/sites/activity-source.js` `notFoldedSeal`), which needs, on the seal, WHICH
-- files it holds and WHEN its window opened — and, on an upload, which files the upload wrote.
--
-- 🔒 Nullable additions only. Null = recorded before these columns, or a host that did not say:
-- such a seal is never folded (it stays as it was), and an upload with no files explains none.

-- Every path the seal commit holds (`webroot-git.sh` `sealed_json` / `recent_outside_json`), null when
-- the host sent none or more than the cap (`recordOutside`).
alter table site_outside add column if not exists paths text[];
-- The commit time of the seal's parent: every change in the seal was made after it, so a CMS row
-- that explains the seal happened after it too. Null from a host that does not send it.
alter table site_outside add column if not exists parent_at timestamptz;

-- The files a CMS row wrote, relative to the webroot, when the collector can read them off the CMS
-- (a WordPress upload: `_wp_attached_file` and its generated sizes). Null for every other row.
alter table site_cms_change add column if not exists files text[];
