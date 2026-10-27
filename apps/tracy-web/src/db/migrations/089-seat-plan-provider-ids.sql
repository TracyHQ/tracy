-- Subscription providers are listed by the broker (`seat-plan/providers.js`), which refuses an unknown
-- id before any row is written. A hard-coded list here made every new provider a schema change
-- (078 allowed only claude and codex); the column now only has to hold a well-formed provider id.
alter table seat_plan_connection drop constraint if exists seat_plan_connection_provider_check;
alter table seat_plan_connection
  add constraint seat_plan_connection_provider_check check (provider ~ '^[a-z][a-z0-9-]{0,31}$');
alter table seat_plan_attempt drop constraint if exists seat_plan_attempt_provider_check;
alter table seat_plan_attempt
  add constraint seat_plan_attempt_provider_check check (provider ~ '^[a-z][a-z0-9-]{0,31}$');
