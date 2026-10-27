-- THE DESIGN SYSTEM PICKED IN THE ADD SITE FORM, CARRIED BY THE CREATE REQUEST AND PUT ON THE NEW SITE BY
-- THE SERVER AT THE END OF ITS BUILD (12/10/2026).
--
-- It used to wait in the browser tab's memory and be written by the tab once the site was up, so a
-- reload or a closed tab during the ~2.5 minute build left the site wearing the template's own look,
-- with nothing said. Now `POST /api/sites {designSystem}` writes this row, and `tracy-web` applies it
-- itself once the host's provision job is done and the site's brief (if any) is written
-- (`sites/design-system-at-create.js`), through the Design system door's own write (same bytes, same
-- Site changes row, same undo).
--
-- One row per site created with a pick; a site made with the template's own look has none.
--
--   actor        the person who created the site: the write is theirs, as if they pressed Apply
--   job_id/host  the provision job the build waits for; a retry of a failed install moves them on
--   state        queued -> applying -> applied | skipped | failed. `skipped`: the template cannot wear
--                a system (`reason` says why). `failed`: the site did not come up, or the write did
--                not land (`reason`). Never retried by the server; the Design system panel still
--                applies by hand.
--   apply_id     the Design system door's undo id (`site_design_system.undo_id`) once applied
--   handed_at    the first poll of the finished job that handed the site over (repo, lane, content
--                door), so later polls while the pick is written do not hand it over again
create table if not exists site_create_design_system (
  site_key    text primary key references site(site_key) on delete cascade,
  account_id  uuid,
  actor       text not null,
  system_id   text not null,
  system_name text,
  job_id      text,
  host        text,
  state       text not null default 'queued'
              check (state in ('queued', 'applying', 'applied', 'skipped', 'failed')),
  reason      text,
  apply_id    text,
  handed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists site_create_design_system_open
  on site_create_design_system (updated_at) where state in ('queued', 'applying');
