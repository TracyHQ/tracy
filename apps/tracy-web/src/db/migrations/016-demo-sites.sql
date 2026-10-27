-- Public demos of quickstarts (tasks/todo-demo-tu-quickstart.md): where each one answers, and
-- which site rows ARE demos rather than a customer's copy.
--
-- `demo_domain` is authored by a person on `/ops/cms/demos` and only when the derived default
-- (`lib/demo-domain.js`) is not the address they want — most tags never get a row. The label is
-- the whole address minus the zone (`business-joomla` → business-joomla.tracy.ai), unique because
-- one address serves exactly one demo. `revision` is the optimistic lock two admin tabs disagree
-- through, same shape as `build_base`.
create table demo_domain (
  tag text primary key,
  label text not null unique,
  revision integer not null default 1,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- A demo is a site row like any other (it has a host, a job, a quickstart version), with one bit
-- saying so: the ops screen lists it, the seat book never hands it to a customer, and a redeploy
-- may tear it down without asking — none of which is true of a customer's copy.
alter table site add column demo boolean not null default false;
create index site_demo on site(quickstart_tag) where demo;
