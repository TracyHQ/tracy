-- When the host deleted what it kept of the live site for a site's syncs (the last read's dump and
-- manifest, `webroot-sync.sh --op forget`): set on the newest row once the site has not synced for
-- the retention period (`sites/live-sync.js` FORGET_AFTER_DAYS). Its own file, not a line in 143:
-- stands that ran the branch had applied 143 already.
alter table site_sync add column if not exists forgotten_at timestamptz;
