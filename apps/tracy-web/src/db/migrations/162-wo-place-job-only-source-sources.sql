-- A one-part research run may also refresh ONE source of a place (the Retry on a row of its research card).
alter table wo_place_job drop constraint if exists wo_place_job_only_source_check;
alter table wo_place_job add constraint wo_place_job_only_source_check
  check (only_source is null or only_source in ('logo', 'website', 'facebook', 'instagram', 'tiktok', 'youtube',
    'google-places', 'google-maps', 'tripadvisor'));
