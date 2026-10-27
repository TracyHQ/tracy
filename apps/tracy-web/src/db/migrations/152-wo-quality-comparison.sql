-- A comparison's two explicitly accepted arms retain their allowance when switching or rebuilding.
create table wo_quality_comparison (
  id uuid primary key,
  account_id uuid not null,
  opportunity_id uuid not null,
  input_hash text not null,
  input jsonb not null,
  created_at timestamptz not null default now(),
  unique(id,account_id,opportunity_id)
);
create table wo_quality_comparison_arm (
  comparison_id uuid not null,
  variant text not null check(variant in ('baseline','candidate')),
  account_id uuid not null,
  opportunity_id uuid not null,
  intent_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(comparison_id,variant),
  unique(intent_id),
  foreign key(comparison_id,account_id,opportunity_id)
    references wo_quality_comparison(id,account_id,opportunity_id),
  foreign key(intent_id,account_id,opportunity_id)
    references wo_quality_intent(id,account_id,opportunity_id)
);
create function freeze_wo_quality_comparison() returns trigger language plpgsql as $$
begin
  raise exception 'WO quality comparison binding is immutable';
end $$;
create trigger wo_quality_comparison_frozen before update or delete on wo_quality_comparison
  for each row execute function freeze_wo_quality_comparison();
create trigger wo_quality_comparison_arm_frozen before update or delete on wo_quality_comparison_arm
  for each row execute function freeze_wo_quality_comparison();
