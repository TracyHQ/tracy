-- Website Opportunities stops depending on `account`: the open layer's tables point at a neutral
-- `wo_principal`, which Tracy maps to its accounts and a standalone install fills with its own operator.
--
-- Mapping: one principal per Tracy account, with THE SAME uuid (`id = account.id`, kind `tracy_account`,
-- `external_ref = account.id::text`). No WO row changes value: the `account_id`-style columns keep their names and
-- contents, only their foreign keys move from `account(id)` to `wo_principal(id)` with the same ON DELETE action.
-- Every account gets a principal, and two triggers on `account` (Tracy's side of the mapping, not in the open
-- baseline) keep the pair in step: a new account gets its principal, a deleted account takes its principal and,
-- through the cascade, its WO rows with it, exactly as the old FKs did.
--
-- Not given a FK, as before: wo_cost_ledger.account_id, wo_place_backfill.from_account_id, wo_social_stat.requested_by.
--
-- Shaped for a live deploy (measured on dev-sized copies at 1x–1000x, transition README):
-- - the bulk backfill runs before any write-blocking lock; under the lock only the accounts created meanwhile are added;
-- - every table is locked in one statement, child tables before `account`: dropping a FK takes ACCESS EXCLUSIVE on
--   both sides, and taking `account` first deadlocked a live ledger insert that checks its payer account;
-- - the FKs are added NOT VALID (no scan under the lock); 172 validates them without blocking writes.
--
-- Rollback (by hand, in one transaction; WO rows are untouched, so the FKs to `account` validate again):
-- ROLLBACK BEGIN
-- alter table wo_preference drop constraint wo_preference_account_id_fkey,
--   add constraint wo_preference_account_id_fkey foreign key (account_id) references account(id) on delete cascade;
-- alter table wo_opportunity drop constraint wo_opportunity_account_id_fkey,
--   add constraint wo_opportunity_account_id_fkey foreign key (account_id) references account(id) on delete cascade;
-- alter table wo_job drop constraint wo_job_account_id_fkey,
--   add constraint wo_job_account_id_fkey foreign key (account_id) references account(id) on delete cascade;
-- alter table wo_media drop constraint wo_media_account_id_fkey,
--   add constraint wo_media_account_id_fkey foreign key (account_id) references account(id) on delete cascade;
-- alter table wo_bulk_request drop constraint wo_bulk_request_account_id_fkey,
--   add constraint wo_bulk_request_account_id_fkey foreign key (account_id) references account(id) on delete cascade;
-- alter table wo_place_job drop constraint wo_place_job_started_by_account_id_fkey,
--   add constraint wo_place_job_started_by_account_id_fkey foreign key (started_by_account_id) references account(id) on delete set null;
-- alter table wo_cost_ledger drop constraint wo_cost_ledger_payer_account_id_fkey,
--   add constraint wo_cost_ledger_payer_account_id_fkey foreign key (payer_account_id) references account(id) on delete set null;
-- drop trigger if exists account_wo_principal_insert on account;
-- drop trigger if exists account_wo_principal_delete on account;
-- drop function if exists account_wo_principal_insert();
-- drop function if exists account_wo_principal_delete();
-- drop table wo_principal;
-- delete from schema_migration where name in ('171-wo-principal.sql', '172-wo-principal-validate.sql');
-- ROLLBACK END

create table wo_principal (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind <> ''),
  external_ref text,
  created_at timestamptz not null default now(),
  constraint wo_principal_kind_ref unique (kind, external_ref)
);

insert into wo_principal (id, kind, external_ref, created_at)
select id, 'tracy_account', id::text, now() from account
on conflict do nothing;

create function account_wo_principal_insert() returns trigger language plpgsql as $$
begin
  insert into wo_principal (id, kind, external_ref) values (new.id, 'tracy_account', new.id::text)
  on conflict do nothing;
  return new;
end $$;

create function account_wo_principal_delete() returns trigger language plpgsql as $$
begin
  delete from wo_principal where id = old.id and kind = 'tracy_account';
  return old;
end $$;

-- Child tables first, `account` last: see the header.
lock table wo_preference, wo_opportunity, wo_job, wo_media, wo_bulk_request, wo_place_job, wo_cost_ledger, account
  in access exclusive mode;

create trigger account_wo_principal_insert after insert on account
  for each row execute function account_wo_principal_insert();
create trigger account_wo_principal_delete after delete on account
  for each row execute function account_wo_principal_delete();

-- Accounts created between the backfill and the lock.
insert into wo_principal (id, kind, external_ref, created_at)
select a.id, 'tracy_account', a.id::text, now() from account a
where not exists (select 1 from wo_principal p where p.id = a.id)
on conflict do nothing;

alter table wo_preference drop constraint wo_preference_account_id_fkey,
  add constraint wo_preference_account_id_fkey foreign key (account_id) references wo_principal(id) on delete cascade not valid;
alter table wo_opportunity drop constraint wo_opportunity_account_id_fkey,
  add constraint wo_opportunity_account_id_fkey foreign key (account_id) references wo_principal(id) on delete cascade not valid;
alter table wo_job drop constraint wo_job_account_id_fkey,
  add constraint wo_job_account_id_fkey foreign key (account_id) references wo_principal(id) on delete cascade not valid;
alter table wo_media drop constraint wo_media_account_id_fkey,
  add constraint wo_media_account_id_fkey foreign key (account_id) references wo_principal(id) on delete cascade not valid;
alter table wo_bulk_request drop constraint wo_bulk_request_account_id_fkey,
  add constraint wo_bulk_request_account_id_fkey foreign key (account_id) references wo_principal(id) on delete cascade not valid;
alter table wo_place_job drop constraint wo_place_job_started_by_account_id_fkey,
  add constraint wo_place_job_started_by_account_id_fkey foreign key (started_by_account_id)
    references wo_principal(id) on delete set null not valid;
alter table wo_cost_ledger drop constraint wo_cost_ledger_payer_account_id_fkey,
  add constraint wo_cost_ledger_payer_account_id_fkey foreign key (payer_account_id)
    references wo_principal(id) on delete set null not valid;
