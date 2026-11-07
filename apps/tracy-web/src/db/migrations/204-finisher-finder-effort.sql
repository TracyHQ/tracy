-- The finder door's effort (#448) becomes a setting of its assignment, like the editorial door's: null keeps the
-- finder's default (max, write-step/finder/finder-door.js), any other value is checked by `assignDoor` against the
-- efforts the door's model takes.
alter table llm_assignment drop constraint llm_assignment_check;
alter table llm_assignment add constraint llm_assignment_check
  check (reasoning_effort is null or (door in ('woEditorial', 'vision', 'finisherFinder')
                                      and length(reasoning_effort) between 1 and 40));
