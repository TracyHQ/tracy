-- A demo can live in more than one place, and the places are INDEPENDENT (16/09/2026):
-- Tracy's own demo host, and `demo.joomlart.com` — a machine Tracy did not build and does not run,
-- where 459 demos are already served by one nginx regex block per folder name. A domain does not
-- move between the two; each stays where it is.
--
-- WHY THE KEY WIDENS. `tag` alone as the primary key said "one demo per release", which was true
-- while there was one place to put one. With two, `quickstart/ja-kinetic/j6` has an address on
-- BOTH — `ja-kinetic-joomla.<zone>` that Tracy would build, and `ja-kinetic.demo.joomlart.com`
-- that JoomlArt already serves — and neither is a correction of the other.
alter table demo_domain add column target text not null default 'tracy';

-- 🔒 UNIQUE PER TARGET, NOT GLOBALLY. One address serves exactly one demo — but "one address" is
-- (target, label), because the label is only half of a hostname: `ja-kinetic` under `joomlart` and
-- `ja-kinetic` under `tracy` are two different machines answering two different names. A global
-- unique here would refuse the second one as a duplicate of a hostname it does not share.
alter table demo_domain drop constraint demo_domain_label_key;
alter table demo_domain add constraint demo_domain_target_label unique (target, label);

alter table demo_domain drop constraint demo_domain_pkey;
alter table demo_domain add primary key (tag, target);

-- Which target a demo site row was put on. Null for every row written before this migration —
-- they are all Tracy's, but `demo_target` is left to be backfilled by the code that knows, rather
-- than defaulted here into a claim the column cannot support.
alter table site add column demo_target text;
