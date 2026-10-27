-- A research run that refreshes ONE part of a place (the logo) and nothing else: the retry button of a part that was not collected.
alter table wo_place_job add column if not exists only_source text
  check (only_source is null or only_source in ('logo'));
