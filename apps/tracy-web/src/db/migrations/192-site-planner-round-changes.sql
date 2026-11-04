-- Change lists of the site planner bench's fix rounds (ADR 0041, #301).
--
-- A fix round may answer with only the parts it changes; the server applies them to the previous round's plan and
-- scores the merged plan, which is the round's `plan`. `changes` is the change list as the planner sent it (null when
-- it answered with a whole plan). `reading` records how the answer was read: `form` (plan or changes), `droppedText`
-- (text around the one fenced JSON block was dropped) and `wholePlanAsked` (the reason a change list could not be
-- applied and the answer it came in, when the round asked once for the whole plan).
alter table site_planner_round add column if not exists changes jsonb;
alter table site_planner_round add column if not exists reading jsonb;
