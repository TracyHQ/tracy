-- Shared accounting for Research and editorial; existing reservations keep their attribution.
-- The editorial migration may already have installed these additive columns on its own runtime.
alter table wo_cost_ledger add column if not exists account_id uuid;
alter table wo_cost_ledger add column if not exists action_id uuid;
alter table wo_cost_ledger add column if not exists build_id uuid;
create index if not exists wo_cost_ledger_account_day on wo_cost_ledger(account_id,budget_day)
  where account_id is not null;
