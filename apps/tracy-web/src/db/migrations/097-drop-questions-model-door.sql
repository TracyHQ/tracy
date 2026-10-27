-- The `questions` model door is gone: a row for it can no longer be read, so the table stops
-- accepting one.
--
-- WHY. Migration 026 gave the questionnaire generator a door of its own, and 064 restated the
-- constraint with it still in the list. The generator (`lib/questions-llm.js`) was removed with the
-- /ops question-set editor (10/10/2026), and the door left `LLM_DOORS`; `readAssignments` skips a
-- row whose door the build does not know. What was left is a constraint that allows a value no
-- screen or caller can produce, and — on a deployment that had assigned it — a row nothing reads.
--
-- 🔒 THE DELETE COMES FIRST. Replacing the constraint validates every existing row, so a deployment
-- that still holds `door = 'questions'` would fail this migration, and a failed migration stops the
-- boot. The row it removes was already ignored; no door's model changes.
--
-- 🔒 THE LIST BELOW IS `LLM_DOORS` (`lib/llm-catalog.js`), exactly. `test/db.test.mjs` fails when
-- the two drift apart, so the next door added to the catalogue arrives with its own migration.
delete from llm_assignment where door = 'questions';

alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent'));
