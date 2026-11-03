-- What a call cost, to the thousandth of a cent, and which day cap it counts against (#296, 02/11/2026).
--   actual_millicents  the settled cost × 1000, unrounded per call (a build's look call costs ~0.12 cent and was booked
--                      at 1 cent); null on older rows, which keep their whole `actual_cents`.
--   budget             'research' (a place's research) or 'build' (a site built from it): each has its own day cap
--                      (`/ops/wo` researchDailyCapCents, buildDailyCapCents).
-- Expand-only: an older image writes neither and its rows count as research, as before.
alter table wo_cost_ledger add column if not exists actual_millicents bigint check (actual_millicents >= 0);
alter table wo_cost_ledger add column if not exists budget text not null default 'research'
  check (budget in ('research', 'build'));
create index if not exists wo_cost_ledger_budget_day on wo_cost_ledger (budget, budget_day, state);
