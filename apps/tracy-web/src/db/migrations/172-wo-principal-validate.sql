-- Second half of 171: validates the seven FKs it added NOT VALID. VALIDATE takes SHARE UPDATE EXCLUSIVE, which does not
-- block reads or writes. First drops principals whose account was deleted between 171's backfill and its lock (their
-- delete trigger did not exist yet); no WO row points at them, the old FKs to `account` saw to that.
delete from wo_principal p
where p.kind = 'tracy_account' and not exists (select 1 from account a where a.id = p.id);

alter table wo_preference validate constraint wo_preference_account_id_fkey;
alter table wo_opportunity validate constraint wo_opportunity_account_id_fkey;
alter table wo_job validate constraint wo_job_account_id_fkey;
alter table wo_media validate constraint wo_media_account_id_fkey;
alter table wo_bulk_request validate constraint wo_bulk_request_account_id_fkey;
alter table wo_place_job validate constraint wo_place_job_started_by_account_id_fkey;
alter table wo_cost_ledger validate constraint wo_cost_ledger_payer_account_id_fkey;
