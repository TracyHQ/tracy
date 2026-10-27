-- The site label a Website Opportunities build asked the create door for (`opportunities/builds.js`):
-- the one the person typed, or the one the server made from the place's name. Kept on the row so a
-- retry of the same request without a label asks for the same name, not a newly drawn one.
-- Expand-only: an older image never reads it.
alter table wo_build add column if not exists label text;
