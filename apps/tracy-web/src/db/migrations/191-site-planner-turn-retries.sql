-- Retries of one site planner turn (ADR 0041, #301).
--
-- A model call that meets a transient provider error (a 429, a 5xx, an overloaded answer, a network error before any
-- response) is tried again inside the same turn. Each failed attempt is kept here, in order: attempt number, error
-- code, HTTP status, reason, the wait before the next attempt, and the usage and cost it reported if any. Null on
-- turns saved before retries existed; an empty array when the first attempt settled the call.
alter table site_planner_turn add column if not exists retries jsonb;
