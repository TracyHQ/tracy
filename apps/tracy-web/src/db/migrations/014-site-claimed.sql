-- A site is CLAIMED before it is built (tasks/todo-claim-then-workspace.md, 15/09).
--
-- The first question of a build is the business name, and the name is the site's address. Once it
-- is typed the site can exist: its row, its owner seat, its folder — and the customer moves into
-- that site's own workspace at once, where the rest of the questions, the build and the agent all
-- live. `claimed` is that state: a row with a site and no job, waiting for the press that starts
-- the provision. It is the one state a request may sit in for as long as a person takes to answer
-- a form, so it is never "stale" the way `claiming` is; a claim nobody follows up on is swept by
-- the cron after a day (site row, seat and the reserved folder go together).
alter table site_creation drop constraint if exists site_creation_state_check;
alter table site_creation
  add constraint site_creation_state_check
  check (state in ('claimed', 'claiming', 'provisioning', 'refused'));
