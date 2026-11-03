-- The brand bench's two model doors (brand step trial bench, #320): the agent that builds a brand file and the
-- reviewer that answers questions about its pictures. Doors of their own, so the bench never borrows another step's
-- model; neither takes a reasoning effort (the bench fixes it in code), so the effort check stays as it is.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer'));
