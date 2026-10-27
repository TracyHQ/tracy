-- What a Website Opportunities build wrote into its demo site from the restaurant's own posts, without a model
-- (`opportunities/site-content.js`, `sites/brief-engines/wo-content.js`; tasks/plan-wo-content-writer.md):
--
--   before   {<target key>: the record's fields as they were, read once before the first write} — kept across
--            retries, so a restore puts back the template's own words, never a half-written run's
--   writes   {<target key>: {itemId, state: 'written'|'hidden'|'failed', fields, at, reason?}} — the receipts
--
-- A column beside `pictures`, written by the brief engine of the site's build. Expand-only: an older image never reads it.
alter table wo_build add column if not exists content jsonb;
