-- What the business owner liked on a demo's share page (`opportunities-build/demo-link-route.js`, the "See another look"
-- control; `lib/wo-demo-links.js` `recordSystemPick`): one row per press of "I like this look", so the seller reads which
-- look the owner chose next to the counted opens (migration 216).
--
-- wo_demo_system_pick  one counted pick of one share link: when, the look (`current` = the demo as it was built, else
--                      the library id of the design system previewed on it, `refero:<uuid>`), the number the page
--                      showed it under (`Look 2`; null for `current`), the system's library name at that moment, and
--                      the device class read from the User-Agent. Nothing else of the visitor: no address, no
--                      cookie, no User-Agent, no referrer. Bots, the seller's own signed-in session and picks past the
--                      hourly cap of one link are never written. A preview writes nothing to the demo: this row is
--                      the only thing a pick changes.
-- Expand-only: an older image never reads it.
create table if not exists wo_demo_system_pick (
  id uuid primary key,
  link_id uuid not null references wo_demo_link (id) on delete cascade,
  picked_at timestamptz not null default now(),
  system_id text not null check (
    system_id = 'current'
    or system_id ~ '^refero:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  n smallint check (n between 1 and 9),
  name text check (length(name) between 1 and 200),
  device text not null check (device in ('phone', 'desktop')),
  check ((system_id = 'current') = (n is null))
);
create index if not exists wo_demo_system_pick_link on wo_demo_system_pick (link_id, picked_at desc);
