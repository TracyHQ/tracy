-- One logical build per press of the Build tab's Submit (plan first-site-build-onboarding §5).
--
-- WHY A ROW AND NOT THE SITE'S OWN NAME. `POST /api/sites` used to answer a second request for a
-- name the caller already owned by provisioning it AGAIN — a double press, a reload mid-wait, or a
-- response lost after the host had accepted the job each started a second `provision.sh` over the
-- same webroot. A name is not a request: this row is the request. The caller names it (`build_id`,
-- a UUID it made and keeps through its retries), and the door keeps exactly one row per
-- (account, build): the same request asked again is answered with the same site and the same job;
-- a request with the same id and a different payload is a conflict; and while a first request is
-- still mid-claim, a second one waits (`CREATE_PENDING`) rather than racing it.
--
-- `attempt` counts provision attempts of this one build: a failed attempt is retried as
-- `attempt + 1`, under a host job named `<build_id>:<attempt>` so the host too answers the same
-- job for the same attempt (`apps/tracy-host/src/app.js`'s `keyedJobId`).
create table site_creation (
  account_id uuid not null references account(id) on delete cascade,
  build_id text not null,
  -- sha256 of the fields that decide what gets built (platform, name, design, revision, quickstart).
  payload_hash text not null,
  -- `claiming` until the site row, the owner seat and the host's job exist; `provisioning` once
  -- they do; `refused` when the host would not take the job (the next request with this id may
  -- try again at once).
  state text not null default 'claiming' check (state in ('claiming', 'provisioning', 'refused')),
  site_key text references site(site_key) on delete set null,
  job_id text,
  attempt integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, build_id)
);
