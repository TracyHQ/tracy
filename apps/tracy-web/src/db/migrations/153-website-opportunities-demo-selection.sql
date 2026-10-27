-- Persist the customer's explicit quickstart choice before asynchronous model/build work.
alter table wo_demo_action add column if not exists selection jsonb;
