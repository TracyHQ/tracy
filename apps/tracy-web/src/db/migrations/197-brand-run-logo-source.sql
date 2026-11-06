-- Where a brand run's found logo came from (brand step trial bench, #321): {kind: 'media', mediaId} when the worker
-- loaded it from the brief's media id, {kind: 'file', name} when it was given as a file at the start. Never the bytes
-- and never a path. Not part of the frozen run input: a media source is only known when the worker claims the run.
alter table brand_run add column if not exists logo_source jsonb;
