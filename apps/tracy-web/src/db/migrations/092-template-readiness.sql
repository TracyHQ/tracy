-- The Customize your site check of each release version (ADR 0029, the Template Customization
-- Question Readiness check), as this server last ran it. Read by the Road to live step
-- `customize` and by the publish door (`lib/customize-readiness.js`, `lib/road-to-live.js`).
--
--   tag, version  the release and the version of its tracy_setting.json the check ran on
--   fingerprint   the release's assets (name, size, digest) when the check started: a release whose
--                 files changed under the same version is checked again on the next read
--   state         'checking' (queued or running), 'done' (report holds the result), 'error' (the
--                 check could not run; reason says why)
--   report        the whole report of `checkRelease`, `{ template, cms, version, tag, results }`
--
-- 🔒 A CACHE WITH A JOB, LIKE quickstart_releases. Nothing here is authored by a person: every row
-- is written by the background check after a read of the releases, or by Check again. Which rule
-- holds Publish is NOT stored here: it is read at answer time from `rule-severity.json`, so moving a
-- rule between groups needs no new check.
create table if not exists template_readiness (
  tag text not null,
  version text not null,
  fingerprint text not null,
  state text not null check (state in ('checking', 'done', 'error')),
  report jsonb,
  reason text,
  started_at timestamptz not null default now(),
  checked_at timestamptz,
  primary key (tag, version)
);
