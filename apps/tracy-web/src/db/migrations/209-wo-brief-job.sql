-- Making a Content brief is a background job (#524): `POST /api/website-opportunities/:id/revisions` answers 202 with
-- the job, and `GET …/:id/brief-jobs/:jobId` answers its step and, once done, the revision it made. One running job
-- per opportunity; the same requestId answers the same job. A job whose worker stopped (a deploy) is read as failed,
-- or as done when its brief was written. Expand-only: an older image never reads it.
create table if not exists wo_brief_job (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
  request_id text not null,
  state text not null default 'running' check (state in ('running', 'done', 'failed')),
  step text,
  revision_id uuid references wo_revision(id) on delete set null,
  reused boolean not null default false,
  error jsonb,
  heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, request_id)
);
create unique index if not exists wo_brief_job_one_running on wo_brief_job (opportunity_id) where state = 'running';
create index if not exists wo_brief_job_opportunity on wo_brief_job (opportunity_id, created_at desc);
