-- The write step's finder (#448): a door of its own for the model that looks at the written site's page screenshots and
-- names the customer-visible faults step 9b sends to Tracy's site agent. It takes no reasoning effort setting: the finder
-- thinks at max, fixed in code (write-step/finder/finder-door.js).
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter', 'picturePicker', 'pictureIconRanker',
                  'pictureLooker', 'pictureDrawer', 'finisherFinder'));
