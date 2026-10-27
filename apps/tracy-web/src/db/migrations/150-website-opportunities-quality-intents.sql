-- A user intent owns limits across revisions, rebuilds and provider/configuration changes.
create table wo_quality_intent (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  opportunity_id uuid not null,
  generation integer not null check (generation > 0),
  semantic_hash text not null,
  semantic_input jsonb not null,
  policy jsonb not null,
  state text not null default 'pending',
  repair_count integer not null default 0 check (repair_count between 0 and 2),
  repairs jsonb not null default '{}',
  deadline timestamptz not null,
  created_at timestamptz not null default now(),
  unique (account_id,opportunity_id,generation),
  unique (id,account_id,opportunity_id)
);
alter table wo_quality_run add column intent_id uuid;
-- Existing holds use the old run id as job_id; preserve that budget identity during migration.
insert into wo_quality_intent
  (id,account_id,opportunity_id,generation,semantic_hash,semantic_input,policy,state,
   repair_count,repairs,deadline,created_at)
select id,account_id,opportunity_id,
  row_number() over (partition by account_id,opportunity_id order by created_at,id),
  input_hash,input,policy,state,repair_count,
  coalesce((select jsonb_object_agg(key,value) from jsonb_each(artifacts) where key like 'repair:%'),'{}'),
  created_at + interval '48 hours',created_at
from wo_quality_run;
update wo_quality_run set intent_id=id;
alter table wo_quality_run alter column intent_id set not null;
alter table wo_quality_run add constraint wo_quality_run_intent_scope
  foreign key (intent_id,account_id,opportunity_id)
  references wo_quality_intent(id,account_id,opportunity_id);
create table wo_quality_current_intent (
  account_id uuid not null,
  opportunity_id uuid not null,
  intent_id uuid not null,
  primary key (account_id,opportunity_id),
  foreign key (intent_id,account_id,opportunity_id)
    references wo_quality_intent(id,account_id,opportunity_id)
);
insert into wo_quality_current_intent
select distinct on (account_id,opportunity_id) account_id,opportunity_id,id
from wo_quality_intent order by account_id,opportunity_id,generation desc;
alter table wo_quality_attempt add column intent_id uuid references wo_quality_intent(id);
update wo_quality_attempt a set intent_id=r.intent_id from wo_quality_run r where a.run_id=r.id;
alter table wo_quality_attempt alter column intent_id set not null;
create unique index wo_quality_attempt_intent_cache on wo_quality_attempt(intent_id,stage,input_hash);
create or replace function freeze_wo_quality_intent() returns trigger language plpgsql as $$
begin
  if (new.id,new.account_id,new.opportunity_id,new.generation,new.semantic_hash,
      new.semantic_input,new.policy,new.deadline,new.created_at)
     is distinct from
     (old.id,old.account_id,old.opportunity_id,old.generation,old.semantic_hash,
      old.semantic_input,old.policy,old.deadline,old.created_at) then
    raise exception 'WO quality intent is immutable';
  end if;
  return new;
end $$;
create trigger wo_quality_intent_frozen before update on wo_quality_intent
  for each row execute function freeze_wo_quality_intent();
-- The existing frozen-input trigger also protects the append-only revision-to-intent binding.
create or replace function freeze_wo_quality_input() returns trigger language plpgsql as $$
begin
  if (new.account_id,new.opportunity_id,new.revision_id,new.action_id,new.parent_run_id,
      new.input_hash,new.input,new.policy,new.intent_id)
     is distinct from
     (old.account_id,old.opportunity_id,old.revision_id,old.action_id,old.parent_run_id,
      old.input_hash,old.input,old.policy,old.intent_id) then
    raise exception 'WO quality input is immutable';
  end if;
  return new;
end $$;
