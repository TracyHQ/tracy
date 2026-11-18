-- A demo action refused before any billable work gives its daily build back (#564). Each action keeps the day and
-- kind it was charged on (`usage_day`, `usage_kind`), so the refund lands on that row even after midnight, and
-- `usage_refunded_at` makes it happen once. `work_started_at` is set right before a labelling run the action's brief
-- started makes a paid model call, or when a logo research run is queued for it: such an action keeps its charge. Actions accepted before this migration have
-- no `usage_day` and are never refunded. Expand-only: an older image neither writes nor reads these columns.
alter table wo_demo_action add column if not exists usage_day date;
alter table wo_demo_action add column if not exists usage_kind text;
alter table wo_demo_action add column if not exists usage_refunded_at timestamptz;
alter table wo_demo_action add column if not exists work_started_at timestamptz;
create index if not exists wo_demo_action_usage_refund on wo_demo_action (account_id)
  where status = 'failed' and usage_day is not null and usage_refunded_at is null;
