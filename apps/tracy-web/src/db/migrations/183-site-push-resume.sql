-- A push whose host job was lost (the host restarted mid-write) is run again once with the same
-- push id, so the host goes on from its write journal (#122): what it needs to start the same job
-- again (whether PHP files were confirmed), and how many times it was started again.
alter table site_push add column if not exists php boolean not null default false;
alter table site_push add column if not exists resumed integer not null default 0;
