-- The picture bench's picker door (#342, ADR 0043): a door of its own, so the picture bench never borrows the planner's
-- or the writer's model. Like the writer's, it takes no reasoning effort (the bench fixes it in code: max on DeepSeek
-- Flash, lib/bench-harness.js), so the effort check stays as it is.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter', 'picturePicker'));
