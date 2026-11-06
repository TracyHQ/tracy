-- The site planner bench's door (ADR 0041, #301). A door of its own, so the bench never borrows a WO door; it
-- takes no reasoning effort (the bench fixes it in code), so the effort check stays as it is.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner'));
