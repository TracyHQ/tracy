-- Real pictures on a demo site (tasks/plan-website-opportunities-pictures.md): what is known about each collected
-- picture, and the plan that put them on a site.
--
-- wo_media.caption / alt  the words that came with the picture (until now read once for `category`, then dropped);
--                         collected text, so data for the planner and never an instruction to anything
-- wo_media.dhash          64-bit difference hash, 16 hex digits (`lib/picture-cut.js`): near-copies are ≤ 6 bits apart
-- wo_media.labels         {features: {v, top2Share, edgeDensity, centreLuminance},
--                          vision?: {key, model, at, costUsd, labels: {subject, textPresence, quality, focus, ...}}};
--                         `vision.key` names the model, prompt, schema and preprocessing it was made with, so a
--                         change of any of them labels again instead of reading an old answer
-- wo_build.pictures       {plan: {...}, planHash, at, receipts: {groupId: {state, path, sha256, rect}}, report}: the
--                         plan is written once, before the first upload, and a retry reads it instead of planning again
alter table wo_media add column if not exists caption text;
alter table wo_media add column if not exists alt text;
alter table wo_media add column if not exists dhash text;
alter table wo_media add column if not exists labels jsonb;
alter table wo_build add column if not exists pictures jsonb;
