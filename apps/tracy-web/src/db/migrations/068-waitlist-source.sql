-- Where a whitelist form came from (`lib/sign-in-source.js`): the cleaned `utm_*` the tracy.ai form
-- page carried, sent by the WordPress plugin with the form (`beta/confirmation.js`) so `/ops` › Beta ›
-- Waitlist can say it. Rows written before this column, or by a plugin that does not send it, read as
-- "no source".
alter table beta_waitlist add column if not exists source jsonb;
