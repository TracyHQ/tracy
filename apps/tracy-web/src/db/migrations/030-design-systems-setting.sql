-- Whether Design inspiration offers the design-system library on this server, or only finished
-- templates. One value for the whole deployment and for all three CMSs, flipped by an operator on
-- the Quickstarts screen; it takes effect on the next read, with no release and no rebuild.
--
-- No seed row, same as `inventory_sweep`: a missing row reads as OFF in code, so a fresh server and
-- a server nobody touched both hide the library from the first deploy.
create table design_systems_setting (
  id boolean primary key default true check (id),
  shown boolean not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
