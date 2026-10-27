-- A build that ended says so. Until now `site_creation` had no terminal state at all: a row went
-- `claiming` → `provisioning` and stayed there whether the fleet finished the site or died at its
-- last step. Measured 15/09 on the local stand — provisioning failed at 01:16 (a port another
-- process on the machine held) and at 01:28 the row still read `provisioning`, which is what every
-- later reader believed.
--
-- `refused` was not the word for it: that state means the host would not TAKE the job, and it is
-- what `takeOverCreation` treats as free to retake. A job that was taken and then failed is a
-- different fact, and a finished one needs a word of its own too.
alter table site_creation drop constraint site_creation_state_check;
alter table site_creation
  add constraint site_creation_state_check
  -- `claimed` is here because 014 added it while this migration waited in a branch: a rewrite of
  -- the constraint that forgets a state already in use refuses every row the code still writes
  -- (measured 16/09 while merging #95: cron's own sweepClaims test died on this check).
  check (state in ('claimed', 'claiming', 'provisioning', 'refused', 'done', 'failed'));
