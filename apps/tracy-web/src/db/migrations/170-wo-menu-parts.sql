-- The Menu (tasks/todo-wo-menu-items.md): a place's menu files and pages (`menu-file`) and its menu photos
-- (`menu-photos`) are research parts of their own, so each can be tried again alone.
alter table wo_place_job drop constraint if exists wo_place_job_only_source_check;
alter table wo_place_job add constraint wo_place_job_only_source_check
  check (only_source is null or only_source in ('logo', 'website', 'facebook', 'instagram', 'tiktok', 'youtube',
    'google-places', 'google-maps', 'tripadvisor', 'facebook-search', 'instagram-search', 'menu-file', 'menu-photos'));
