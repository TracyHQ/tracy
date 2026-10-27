-- Public names are mutable; the site key, fleet label, seats and folders are not.
alter table site add column primary_name text;
create table site_name (
  name text primary key check (name = lower(name)),
  site_key text not null references site(site_key) on delete cascade,
  kind text not null default 'legacy' check (kind in ('legacy','managed','custom')),
  state text not null default 'active' check (state in ('active','pending','applying','failed')),
  token text,
  ownership_verified_at timestamptz,
  change_id uuid,
  previous_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_name_site on site_name(site_key);
create unique index site_name_one_change on site_name(site_key) where state='applying';
insert into site_name(name,site_key) select lower(site_key),site_key from site;
-- A duplicate hostname belonging to two sites aborts this migration rather than guessing ownership.
insert into site_name(name,site_key)
select lower(substring(address from '^https?://([^/:]+)')),site_key from site
where address ~ '^https?://[^/:]+' and lower(substring(address from '^https?://([^/:]+)')) <> lower(site_key);

-- Every creation path (including inventory SQL) shares the same uniqueness boundary.
create function reserve_site_identity_names() returns trigger language plpgsql as $$
declare hostname text; held text;
begin
  foreach hostname in array array[lower(new.site_key),lower(substring(new.address from '^https?://([^/:]+)'))] loop
    if hostname is null then continue; end if;
    insert into site_name(name,site_key) values(hostname,new.site_key)
      on conflict(name) do nothing;
    select site_key into held from site_name where name=hostname;
    if held <> new.site_key then
      raise exception 'site name already reserved' using errcode='23505', constraint='site_name_pkey';
    end if;
  end loop;
  return new;
end $$;
create trigger site_reserve_names after insert or update of address on site
for each row execute function reserve_site_identity_names();
