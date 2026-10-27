-- Research pressed on the sign-in-free `/find` (`opportunities/place-jobs.js admitPublicResearch`):
-- one row per place a stranger asked for, whether it queued a NEW place job or joined a running one.
--
-- receipt        the only way a stranger reads that job's progress (`GET /find/api/research`);
--                random, never an account, opportunity or job id
-- provider_id    the Google place id the stranger sent, the only place name a receipt answers with
-- place_job_id   the shared job it waits on: a row here keeps that job alive when the last signed-in
--                request on it is cancelled (`releasePlaceJob`)
-- ip_bucket      the address it counts against (IPv6 per /64, `public/wo-find-page.js ipBucketOf`)
-- new_job        true when this press queued the job: only those count toward the day limits
-- reserved_cents the per-job research cap held from `researchPublicDailyCapCents` while the job runs;
--                an ended job counts its real ledger cost instead (`publicResearchRefusal`)
create table if not exists wo_place_public_request (
  receipt uuid primary key default gen_random_uuid(),
  place_id uuid not null references wo_place(id),
  provider_id text not null,
  place_job_id uuid not null references wo_place_job(id),
  ip_bucket text not null,
  new_job boolean not null,
  reserved_cents integer not null default 0 check (reserved_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists wo_place_public_request_day on wo_place_public_request (created_at) where new_job;
create index if not exists wo_place_public_request_job on wo_place_public_request (place_job_id);
