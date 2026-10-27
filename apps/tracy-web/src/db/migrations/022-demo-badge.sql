-- Whether a demo carries the Tracy badge (`badge/script.js`): the advertisement pill with Tracy's
-- mark and "Customize with Tracy", which opens the demo's own template on the Design inspiration
-- page. A person decides it at install time (16/09: an option at install, with or without
-- the badge), so it is a column on the site row, not a deployment-wide setting: two
-- demos on one host may answer differently, and a redeploy must not silently flip either one.
--
-- Default true: a demo exists to advertise, and the one that wants no badge says so.
alter table site add column badge boolean not null default true;
