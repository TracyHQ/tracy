-- `POST /v1/demos` (tasks/todo-wo-public-demos.md B, 24/10/2026): demos an outside builder asks for with an
-- account token. Expand-only: an older image ignores these tables and the wider check.
--
-- wo_public_demo    one request, its idempotency key and the fingerprint of its whole body, the snapshot it was
--                   built from, and the demo action it was accepted as. `sponsored`: built on Tracy's model (the
--                   account had no AI account), with `reserved_cents` held against the monthly budget. A request
--                   cancelled before its site existed (`cancelled_without_site`) holds no hosting slot.
-- wo_sponsor_setting the Tracy-side numbers of that door, set on /ops/wo › Settings: live demos per account and
--                   the model budget. One row.
-- wo_demo_usage     `external` counts these builds apart, so they never use the account's daily demo builds.
alter table wo_demo_usage drop constraint if exists wo_demo_usage_kind_check;
alter table wo_demo_usage add constraint wo_demo_usage_kind_check
  check (kind in ('demo', 'own-site', 'external'));

create table if not exists wo_public_demo (
  id uuid primary key,
  account_id uuid not null references account(id) on delete cascade,
  idempotency_key text not null,
  fingerprint text not null,
  request jsonb not null,
  opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
  action_id uuid not null references wo_demo_action(id) on delete cascade,
  sponsored boolean not null,
  reserved_cents integer not null default 0 check (reserved_cents >= 0),
  photos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_without_site boolean not null default false,
  unique (account_id, idempotency_key)
);
create index if not exists wo_public_demo_account on wo_public_demo (account_id, created_at desc, id desc);
create index if not exists wo_public_demo_sponsored_month on wo_public_demo (created_at) where sponsored;

create table if not exists wo_sponsor_setting (
  id boolean primary key default true check (id),
  settings jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
