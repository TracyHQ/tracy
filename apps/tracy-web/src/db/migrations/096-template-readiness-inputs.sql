-- What each stored Customize your site check was judged with, and whether it is being judged again
-- (`lib/readiness-inputs.js`, `lib/customize-readiness.js`; 12/10/2026).
--
--   inputs            { files, rules, profile, contract }: the version of each input the check ran
--                     with. When the server's own versions differ, the release is checked again in
--                     the background. NULL (rows written before this column) differs from anything,
--                     so every such row is checked once more.
--   rechecking_since  set while a release that already has a result is checked again; the result
--                     and its state stay as they were, so the Road to live and the publish door keep
--                     reading them. NULL once the new result lands.
--
-- Why: Tracy Business EmDash 1.7.16 was checked on dev while the server still ran the image without
-- its profile row, and the failing result stayed after the deploy, because only the release's files
-- were remembered.
alter table template_readiness add column if not exists inputs jsonb;
alter table template_readiness add column if not exists rechecking_since timestamptz;
