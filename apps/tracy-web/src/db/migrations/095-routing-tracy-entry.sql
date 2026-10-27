-- Tracy AI is an entry of the account's AI account order (tasks/todo-ai-accounts-unify.md, 12/10/2026):
-- `connection_order` lists connection ids AND the literal "tracy" exactly once, and the first entry
-- is the Default. Before, Tracy AI stood outside the order as the flag `tracy_fallback` (079):
-- always after every connection, on or off. Every saved order gets "tracy" appended, so what ran
-- first keeps running first and Tracy AI keeps its place at the end. Rows made after this start as
-- '["tracy"]' (`broker.js` `routing()` says the same for an account with no row).
update seat_plan_routing
  set connection_order = connection_order || '["tracy"]'::jsonb
  where not (connection_order @> '["tracy"]'::jsonb);
alter table seat_plan_routing alter column connection_order set default '["tracy"]';

-- Automatic switching left the interface (G2: the page always sends `enabled: true`), so a row a
-- person had switched off would keep skipping its fallbacks with no way to see or change it.
update seat_plan_routing set enabled = true where not enabled;

-- `tracy_fallback` is no longer read or written: an order always holds Tracy AI. The column stays
-- one release, nullable with its default, so a web image from before this migration (a rollback,
-- or the window of a deploy) still inserts and reads it; a later migration drops it.
alter table seat_plan_routing alter column tracy_fallback drop not null;

-- When the account hid the Getting started row from the account menu (× on the screen keeps the
-- row; "Hide from account menu" sets this). Null = shown while steps remain. Set once by
-- `POST /api/onboarding/menu-hide` (`src/onboarding/route.js`); the same account on web and desktop.
alter table account add column onboarding_menu_hidden_at timestamptz;
