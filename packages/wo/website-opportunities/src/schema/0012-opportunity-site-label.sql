-- The site label the person chose for this opportunity's demo (`PUT /api/website-opportunities/:id/site-label`).
-- Null: a build names the site from the business, as before. Expand-only: an older image never reads it.
alter table wo_opportunity add column if not exists site_label text;
