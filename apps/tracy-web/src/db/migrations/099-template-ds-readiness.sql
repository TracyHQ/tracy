-- The Design system check of each release version (ADR 0031, the Template Design System Readiness
-- check), as this server last ran it. Read by the Road to live step `design-system` and by the
-- publish door (`lib/design-system-readiness.js`, `lib/road-to-live.js`). The twin of
-- `template_readiness` (092, 096): the same columns, its own rows, so the two checks never hold
-- each other's re-check.
--
--   tag, version      the release and the version of its tracy_setting.json the check ran on
--   fingerprint       the release's assets (name, size, digest) when the check started
--   state             'checking', 'done' (report holds the result) or 'error' (reason says why)
--   report            the whole report of `checkRelease`, `{ template, cms, version, tag, results }`
--   inputs            { files, rules, slot }: what the result was judged with; a server whose own
--                     versions differ checks the release again in the background
--   rechecking_since  set while a release that has a result is checked again; the result stays
--
-- 🔒 A CACHE WITH A JOB. Every row is written by the background check after a read of the releases,
-- or by Check again. Which rule holds Publish is read at answer time from
-- `template-design-system-readiness/rule-severity.json`, never stored here.
create table if not exists template_ds_readiness (
  tag text not null,
  version text not null,
  fingerprint text not null,
  state text not null check (state in ('checking', 'done', 'error')),
  report jsonb,
  reason text,
  inputs jsonb,
  started_at timestamptz not null default now(),
  checked_at timestamptz,
  rechecking_since timestamptz,
  primary key (tag, version)
);
