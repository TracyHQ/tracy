-- Background scheduling and billing attribution are independent of a user's priority.
alter table wo_prefetch_campaign drop constraint wo_prefetch_campaign_paid_enabled_check;
alter table wo_prefetch_campaign add column research_mode text not null default 'website'
  check(research_mode in ('website','full'));
alter table wo_prefetch_campaign add column budget_cents integer not null default 10000
  check(budget_cents between 0 and 1000000);
alter table wo_place_job add column research_mode text not null default 'full'
  check(research_mode in ('website','full'));
alter table wo_place_job add column work_priority integer not null default 0 check(work_priority in (0,1));
update wo_place_job set research_mode='website',work_priority=1 where prefetch_campaign_id is not null;
alter table wo_cost_ledger add column prefetch_campaign_id text references wo_prefetch_campaign(id);
create index wo_cost_ledger_prefetch_campaign on wo_cost_ledger(prefetch_campaign_id)
  where prefetch_campaign_id is not null;

-- Receipts precede publication and survive a lost job lease or a replacement job.
create table wo_place_paid_receipt (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references wo_place(id),
  source text not null,
  job_id uuid not null references wo_place_job(id),
  request_hash text not null,
  reservation_id uuid not null unique references wo_cost_ledger(id),
  state text not null check(state in ('starting','received')),
  response jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now()
);
create index wo_place_paid_receipt_lookup on wo_place_paid_receipt(place_id,source,request_hash,created_at desc);
