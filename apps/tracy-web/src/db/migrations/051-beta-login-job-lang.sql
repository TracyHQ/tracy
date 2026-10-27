-- The language of the request that queued a beta sign-in job (#753): the code mail or the
-- whitelist mail the worker sends later goes out in it. Rows queued before this column existed
-- read as English, which is what they would have received anyway.
alter table beta_login_job add column if not exists lang text not null default 'en';
