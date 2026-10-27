-- apps/tracy-web/src/db/migrations/130-website-opportunities-site-check-lease.sql
-- Fencing for the site-check queue (`opportunities/durable-queue.js`, council P0-4 of
-- tasks/todo-wo-social-stats.md): every claim and every re-queue bumps `lease_token`, and a result is
-- written only `where lease_token = <the token the claim handed out>`, so a worker whose lease ran
-- out can no longer overwrite the result of the worker that took the row over.
alter table wo_site_check add column if not exists lease_token bigint not null default 0;
