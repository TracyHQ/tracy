-- The picture bench's looker (#343, ADR 0043): a door of its own for the model that checks every finished picture (of
-- another maker than the picker's), and the writer's alt texts a run may be given (`copy`: the copy file's name, its
-- hash and its alts by frame; null when no copy file was given), which the run compares with what the looker saw.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter', 'picturePicker', 'pictureIconRanker',
                  'pictureLooker'));

alter table site_picture_run add column if not exists copy jsonb;
