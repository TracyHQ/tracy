-- The build manifest a site's own copy answers `/__tracy/build` with, and the ring of
-- browser-reported preview errors `/__tracy/errors` serves back to a signed-in viewer
-- (`bar/route.js`, Plan 4 Task 1 fix round 1). Ported from two Cloudflare KV keys in
-- `workers/fleet-bar/src/index.js` (`build:<label>`, `preview-errors:<hostname>`) into two
-- ordinary tables — this app has one Postgres pool, not a KV namespace, and neither of these
-- needs the "one JSON blob per key" shape KV forced on the Worker.

-- One current row per site — the Worker's `build:<label>` KV entry was already exactly this
-- shape (`{commit, jobsHash, builtAt}`, always overwritten whole), so an upsert is a direct port.
create table site_build (
  site_key text primary key references site(site_key) on delete cascade,
  commit text not null,
  jobs_hash text not null,
  built_at timestamptz not null default now()
);

-- One row per reported browser error, not a JSON array in one cell. This lets Postgres itself
-- keep the ring bounded (`delete ... order by created_at limit ...` in `sites/store.js`'s
-- `appendPreviewErrors`) instead of the ported code parsing, slicing and re-serializing a whole
-- JSON blob on every insert the way the Worker's KV-backed ring had to.
create table preview_error (
  id bigserial primary key,
  site_key text not null references site(site_key) on delete cascade,
  tier text not null default 'browser',
  source text not null,
  message text not null,
  level text not null check (level in ('error', 'warn', 'fatal')),
  at timestamptz not null,
  created_at timestamptz not null default now()
);
create index preview_error_site_created on preview_error (site_key, created_at desc);
