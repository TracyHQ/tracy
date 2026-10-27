-- A social page found by web search for a place with no website of its own (plan-wo-public-research.md,
-- contract §6): accepted only with name + locality + one branch proof, its evidence in `evidence`.
-- `place-merge.js` never auto-merges places on a `search` link.
alter table wo_place_link drop constraint wo_place_link_verified_by_check;
alter table wo_place_link add constraint wo_place_link_verified_by_check
  check(verified_by in ('identity','google','website','operator','osm','search'));
