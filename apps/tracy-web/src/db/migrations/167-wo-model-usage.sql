-- LLM usage of Website Opportunities research (and its Build picture labels), counted against the right person and
-- shown on /ops › Beta › Usage apart from the chat panel's `site_turn` tokens (23/10/2026;
-- tasks/plan-wo-research-usage.md).
--
--   wo_cost_ledger.tokens            what the provider reported for this charge: {version:1, calls, measured, prompt,
--                                    completion, reasoning, total}. NULL = no call reported usage, never zero.
--                                    `reasoning` is part of `completion`; a field the provider did not report is null.
--   wo_cost_ledger.purpose           what the model call was for: menu-photos | logo | picture-labels.
--   wo_cost_ledger.payer             who the charge counts against: account | public | operator | campaign | none.
--                                    NULL = not recorded (rows from before this migration).
--   wo_cost_ledger.payer_account_id  the account of `account` (or the operator's own account). Deliberately NOT
--                                    `account_id`: that column is the key of the per-account spending caps, and
--                                    research is paid by Tracy (19/10/2026). Counting is not capping.
--   wo_place_job.started_by(_account_id)  who created or started the run again; the shared run's payer.
alter table wo_cost_ledger
  add column if not exists tokens jsonb,
  add column if not exists purpose text,
  add column if not exists payer text,
  add column if not exists payer_account_id uuid references account(id) on delete set null;

-- `case` so a bad value fails the check, never the cast (Postgres does not promise `and` runs left to right).
alter table wo_cost_ledger add constraint wo_cost_ledger_tokens_snapshot check (
  tokens is null or case
    when jsonb_typeof(tokens) <> 'object' or tokens->>'version' is distinct from '1' then false
    when coalesce(tokens->>'calls', '') !~ '^[0-9]{1,9}$' or coalesce(tokens->>'measured', '') !~ '^[0-9]{1,9}$' then false
    else (tokens->>'measured')::int >= 1 and (tokens->>'measured')::int <= (tokens->>'calls')::int
  end);
alter table wo_cost_ledger add constraint wo_cost_ledger_payer_known
  check (payer is null or payer in ('account', 'public', 'operator', 'campaign', 'none'));
alter table wo_cost_ledger add constraint wo_cost_ledger_payer_account
  check (payer_account_id is null or payer in ('account', 'operator'));

create index if not exists wo_cost_ledger_model_usage_at on wo_cost_ledger (created_at)
  where purpose is not null or provider = 'vision';

alter table wo_place_job
  add column if not exists started_by text,
  add column if not exists started_by_account_id uuid references account(id) on delete set null;
alter table wo_place_job add constraint wo_place_job_started_by_known
  check (started_by is null or started_by in ('account', 'public', 'operator', 'campaign', 'none'));
