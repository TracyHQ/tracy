-- The provider balance around a site planner bench run (ADR 0041, #301).
--
-- A run on DeepSeek's own API reads the account balance (GET /user/balance) before its first model call and again when
-- it ends, so the money it really took can be set beside the cost the bench computed from its price table. One object:
-- {before, after}, each {at, infos: [{currency, total}], available} as read, or {at, error} when the read failed.
-- Null for runs on other providers and for runs saved before this column. Not an input of the run, so it is not
-- frozen by the input trigger; `before` is written once and never replaced.
alter table site_planner_run add column if not exists balance jsonb;
