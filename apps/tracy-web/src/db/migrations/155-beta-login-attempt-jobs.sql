-- Each admitted sign-in request needs its own decision, even when another request uses the same
-- address before the worker runs. Mail still has its independent per-address delivery cap.
alter table beta_login_job drop constraint beta_login_job_pkey;
alter table beta_login_job add primary key (request_id);

-- Retain the newest request until every older job has expired, including delayed delivery retries.
-- Admission decisions remain per request; only this request may send mail or replace a code.
create table beta_login_latest (
  email text primary key,
  request_id uuid not null,
  expires_at timestamptz not null
);
insert into beta_login_latest (email, request_id, expires_at)
select distinct on (email) email, request_id, expires_at
  from beta_login_job order by email, expires_at desc;
