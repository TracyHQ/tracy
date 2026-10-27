-- Drafting a site questionnaire is a job of its own on the Model & AI screen (22/09/2026).
--
-- WHY IT IS NOT THE `web` DOOR ANY MORE. It was, for an evening: generating a questionnaire runs in
-- this process and wants JSON, exactly like the three jobs `web` already carries, so reusing the
-- door meant no migration and no second thing to configure. The measurement is what changed the
-- answer. One Generate press reads the whole capability snapshot of a release — 28,535 input tokens
-- on `tracy-business/j6` — and has to reason over it well enough to write conditions and bindings
-- that a validator will accept. The other things on that door write a sentence: a card blurb, a
-- label translated into Vietnamese. Pinning both to one model means either paying a reasoning model
-- to write blurbs or asking a cheap one to do the hard job, and the second failure is the quiet one:
-- it comes back as a questionnaire that passes every gate and asks the customer the wrong things.
--
-- 🔒 UNASSIGNED IS NOT OFF. `lib/questions-llm.js` falls back to the `web` door before it falls back
-- to the environment, so every deployment that had Generate working yesterday still has it working
-- after this migration, and the screen says which model it is borrowing. A new row that silently
-- turned a working button off would be a migration doing damage on its way to being helpful.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'seedText', 'seedImage', 'agent', 'questions'));
