-- The picture bench's icon ranking door (#345, ADR 0043): a cheap text model that ranks the icon names code
-- shortlisted for each icon frame. A door of its own, never borrowed from another step; it takes no reasoning effort.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter', 'picturePicker', 'pictureIconRanker'));
