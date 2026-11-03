-- Fix rounds of the site planner bench (ADR 0041, #303).
--
-- A turn the worker found dispatched with no answer after a restart is marked 'abandoned' (the row and anything known
-- about it stay) and its request is sent once more as a new turn whose `resend_of` names it. A resend lost again ends
-- the run.
alter table site_planner_turn drop constraint if exists site_planner_turn_state_check;
alter table site_planner_turn add constraint site_planner_turn_state_check
  check (state in ('dispatched', 'answered', 'refused', 'failed', 'abandoned'));
alter table site_planner_turn add column if not exists resend_of integer check (resend_of >= 0);

-- A round whose answer is not one JSON object is 'not_a_plan': it is not scored, and the message asking for the whole
-- plan as one JSON object is its failure list, sent back like the checker's.
alter table site_planner_round drop constraint if exists site_planner_round_state_check;
alter table site_planner_round add constraint site_planner_round_state_check
  check (state in ('planning', 'checked', 'not_a_plan', 'failed', 'cancelled'));

-- The failures still standing when the run ended with no fix round left; null when the last plan was clean.
alter table site_planner_run add column if not exists standing_failures text;
