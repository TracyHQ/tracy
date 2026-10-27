-- Server-held protocol ownership survives retries and is invisible to legacy queue consumers.
alter table wo_preference add column quality_mode text not null default 'off'
  check (quality_mode in ('off','shadow','apply'));
alter table wo_demo_action add column protocol text not null default 'legacy'
  check (protocol in ('legacy','quality-v1'));
alter table wo_demo_action add constraint wo_demo_action_quality_namespace check (
  (protocol='legacy' and status not like 'quality-%') or
  (protocol='quality-v1' and status in ('quality-queued-v1','quality-failed-v1','quality-completed-v1'))
);
create function freeze_wo_demo_protocol() returns trigger language plpgsql as $$
begin
  if new.protocol is distinct from old.protocol then
    raise exception 'WO action protocol is immutable';
  end if;
  return new;
end $$;
create trigger wo_demo_action_protocol_frozen before update on wo_demo_action
  for each row execute function freeze_wo_demo_protocol();
create index wo_demo_action_quality_queue on wo_demo_action(next_at,queued_at)
  where status='quality-queued-v1';
create unique index wo_quality_run_scope on wo_quality_run(id,account_id,opportunity_id,revision_id);
create table wo_quality_action_link (
  action_id uuid primary key references wo_demo_action(id),
  run_id uuid not null,
  account_id uuid not null,
  opportunity_id uuid not null,
  revision_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(run_id,account_id,opportunity_id,revision_id)
    references wo_quality_run(id,account_id,opportunity_id,revision_id)
);
create function freeze_wo_quality_action_link() returns trigger language plpgsql as $$
begin
  raise exception 'WO quality action link is immutable';
end $$;
create trigger wo_quality_action_link_frozen before update on wo_quality_action_link
  for each row execute function freeze_wo_quality_action_link();
alter table wo_quality_attempt add column action_id uuid;
alter table wo_quality_attempt add column build_id uuid;
