-- apps/tracy-web/src/db/migrations/163-wo-cost-ledger-cost-reported.sql
-- /ops/wo › Settings › Provider order compares providers by cost (23/10/2026), but only on costs the
-- provider itself reported: `settle` writes the ceiling into actual_cents when no cost is known, so the
-- amount alone cannot tell a bill from a ceiling. `cost_reported` says which one it is.
--
--   cost_reported  true = actual_cents is what the provider said the call cost; false = it is the
--                  reserved ceiling (or the row is not settled). Older rows count as reported only
--                  when their cost differs from the ceiling, the one case that proves it was reported.
alter table wo_cost_ledger add column if not exists cost_reported boolean not null default false;
update wo_cost_ledger set cost_reported = true
 where state = 'settled' and actual_cents is not null and actual_cents <> reserved_cents and not cost_reported;
