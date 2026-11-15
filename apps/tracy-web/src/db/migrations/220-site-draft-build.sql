-- The builds a site holds (#612, `build-draft/site-builds.js`): the store `deps.builds` of a step chain run built from
-- a build draft (`docs/references/draft-revision-run.md`, "What the caller passes").
--   site_draft_build       every finished build result of a site, by its ref (the run id), kept so an earlier build
--                          can be restored. `previous` is the ref the build was made from. A forgotten build keeps its
--                          ref and the reason only (`build` null): it named a text the owner now holds.
--   site_draft_build_head  per site: the ref of the build the site holds now (`current_ref`, null for a blank site),
--                          the one unfinished revision run (`unfinished` {runId, from, at}) and when the site row it
--                          belongs to was created (`site_created_at`): a site made again under the same key starts
--                          with no build.
-- 🔒 `build` is `json`, NEVER `jsonb`: jsonb sorts object keys, and a build read back in another key order makes the
-- next revision see its own earlier writes as edits made outside Tracy (`site_changed_outside`, measured 15/11/2026 in
-- `build-draft-site-builds.test.mjs`). The build is read back exactly as it was kept.
-- Expand-only: an older image never reads these tables.
create table if not exists site_draft_build (
  site_key text not null,
  ref text not null,
  build json,
  previous text,
  forgotten_reason text,
  kept_at timestamptz not null default now(),
  forgotten_at timestamptz,
  primary key (site_key, ref)
);

create table if not exists site_draft_build_head (
  site_key text primary key,
  current_ref text,
  unfinished jsonb,
  site_created_at timestamptz,
  updated_at timestamptz not null default now()
);
