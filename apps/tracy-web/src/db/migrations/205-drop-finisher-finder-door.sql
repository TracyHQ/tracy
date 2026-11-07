-- The finisher finder door is gone (#449 removed the screenshot finder and its catalog row), but migrations 203
-- and 204 still allow it. Same shape as migration 097: delete the rows first, then restate both constraints.
-- The list below is `LLM_DOORS` (lib/llm-catalog.js), exactly; the efforts rule is migration 204's without the door.
delete from llm_assignment where door = 'finisherFinder';

alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter', 'picturePicker', 'pictureIconRanker',
                  'pictureLooker', 'pictureDrawer'));

alter table llm_assignment drop constraint llm_assignment_check;
alter table llm_assignment add constraint llm_assignment_check
  check (reasoning_effort is null or (door in ('woEditorial', 'vision')
                                      and length(reasoning_effort) between 1 and 40));
