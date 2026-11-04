-- The picture bench's drawer (#344, ADR 0043): a door of its own for the image model that draws a picture the plan asks
-- for when no owner photo fits, or extends a real photo sideways for a wide band.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter', 'picturePicker', 'pictureIconRanker',
                  'pictureLooker', 'pictureDrawer'));
