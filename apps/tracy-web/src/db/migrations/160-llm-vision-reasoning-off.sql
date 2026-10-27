-- The vision door may carry "off": menu photo reading with reasoning disabled (an option of the assignment, like the
-- editorial door's effort). Any other value stays refused by `assignDoor`.
alter table llm_assignment drop constraint llm_assignment_check;
alter table llm_assignment add constraint llm_assignment_check
  check (reasoning_effort is null or (door in ('woEditorial', 'vision') and length(reasoning_effort) between 1 and 40));
