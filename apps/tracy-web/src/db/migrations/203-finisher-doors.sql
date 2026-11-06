-- The write step's finisher (#420, spec #418): three doors of its own, for the finder that looks at page screenshots, the
-- fixer that turns a fault into a repair order, and the checker that compares a block before and after a repair. Like the
-- picker's, they take no reasoning effort (the bench fixes it in code: max on DeepSeek Flash, lib/bench-harness.js).
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter', 'picturePicker', 'pictureIconRanker',
                  'pictureLooker', 'pictureDrawer', 'finisherFinder', 'finisherFixer', 'finisherChecker'));
