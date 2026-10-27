-- A DOMAIN NOBODY PROVED IS HELD FOR 72 HOURS, NOT FOR EVER (07/10/2026).
--
-- `PUT /api/sites/:key/address {kind:'custom'}` reserved a name on the global key `site_name.name`
-- with no proof, and only the holder's own Remove ever let it go: any Owner of any site could hold
-- somebody else's domain indefinitely. Now a reservation whose ownership (the TXT record) was never
-- read right stops holding the name 72 hours after it was made — on the database's clock — and the
-- site that held it is told it lapsed.
--
--   site_name.hold_until           when an own domain still being connected stops holding its name
--                                  unless its ownership was proven by then; null = no deadline (a
--                                  Tracy address, a connected domain, and the reservations kept
--                                  below). Set when the reservation is made, never moved by saving
--                                  the same name again
--   site_name.ownership_proven_at  when the TXT record was FIRST read right for this reservation
--                                  (its token). Unlike `ownership_verified_at` — the LATEST reading,
--                                  cleared when a later lookup does not find the record — this is
--                                  never cleared by a lookup: a proven name is never taken away by age
--   site_name_lapse                the notice a site keeps after its reservation lapsed, apart from
--                                  the name itself (which another site may hold by then). Gone when
--                                  the Owner removes it or makes a new reservation
--
-- A reservation lapses when it is `custom`, `pending`, never carried to the host (`carried_at`
-- null), never proven, and past `hold_until` (`sites/address.js` `LAPSED`). It lets the name go in
-- ONE statement — the row out, the notice in — run by the reserve door before it inserts, and by
-- the hourly sweep (`cron.js` `sweepExpired`). Every other reader treats such a row as gone already.
--
-- 🔒 WHAT IS KEPT BY THIS MIGRATION, AND WHY. A domain reserved before it has no `hold_until`:
--   - connected, carried, or with its ownership on record as proven now: `ownership_proven_at` is
--     set from that record, and it never lapses;
--   - never looked up at all (no reading, no turn, never written since it was made): held for 72
--     hours from this migration — the customer could not have known of a deadline before it;
--   - looked up, but not proven by the reading on record: KEPT WITHOUT A DEADLINE. Until now a
--     lookup that did not find the record cleared `ownership_verified_at` and overwrote the reading,
--     so whether such a domain was ever proven is lost; taking it away could take a name from its
--     real owner. These are left as they were (the holder's Remove still lets them go).
alter table site_name add column if not exists hold_until timestamptz;
alter table site_name add column if not exists ownership_proven_at timestamptz;

-- 070 gained `dns_turn` and its sequence one commit after it was first written. A database that
-- applied the first version has 070 on record and neither of them, and the second update below
-- reads the column: add both here, where they are missing.
alter table site_name add column if not exists dns_turn bigint not null default 0;
create sequence if not exists site_name_dns_turn;

create table if not exists site_name_lapse (
  site_key text not null references site(site_key) on delete cascade,
  name text not null check (name = lower(name)),
  lapsed_at timestamptz not null default now(),
  primary key (site_key, name)
);

update site_name
   set ownership_proven_at = coalesce(ownership_verified_at, checked_at, updated_at)
 where kind = 'custom' and ownership_proven_at is null
   and (state = 'active' or carried_at is not null or ownership_verified_at is not null
        or (dns_reading -> 'ownership' ->> 'status' = 'ok' and dns_reading ->> 'token' = token));

update site_name
   set hold_until = now() + interval '72 hours'
 where kind = 'custom' and state = 'pending' and ownership_proven_at is null and carried_at is null
   and checked_at is null and dns_turn = 0 and dns_reading is null
   -- Before 070 a lookup wrote only `ownership_verified_at` and `updated_at`: a row written since it
   -- was made may have been looked up, and is kept as above.
   and updated_at = created_at;

-- The sweep's one read: reservations with a deadline.
create index if not exists site_name_hold on site_name (hold_until) where hold_until is not null;
