-- A design system put on a running site by the Design system door (plan
-- tasks/ke-hoach-nut-design-system.md): one row per press of "Apply to this site". The bytes the
-- site held before live on the site's host (`site-ds-slot` undo entry `undo_id`); this row says who
-- pressed, which system replaced which, and whether it was taken back. The Site changes row is the
-- `site_write` (via `ds-slot`) written in the same door.
create table site_design_system (
  id bigserial primary key,
  site_key text not null references site(site_key) on delete cascade,
  undo_id text not null,
  platform text not null,
  system_id text not null,
  system_name text,
  previous_id text,
  previous_name text,
  actor text,
  applied_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by text,
  unique (site_key, undo_id)
);
create index site_design_system_site on site_design_system (site_key, applied_at desc);
