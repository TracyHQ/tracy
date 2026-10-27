-- The demo QA gate after a hand-off (tasks/plan-wo-qa-gate-and-fb-photos.md §3, §6): `opportunities/demo-qa.js`.
--
-- wo_build.qa              {state: pending|retry|passed|failed, sessionId, by, since, baseline: {cssRules, pictures,
--                          texts}, pages, baselineChecks, repairs, rounds: [{n, at, durationMs, checks, failed}], reason}:
--                          the baseline is read off the site as it was handed over, before the agent's turn
-- wo_build.qa_lease_until  who runs the next QA round holds the row until then (`for update skip locked`)
--
-- A column of its own, not a key of `handoff`: every press of "Hand to the agent" rewrites `handoff` whole
-- (`saveHandoff`), and a press after the agent's turn must neither wipe the rounds nor take a new baseline off a
-- site the agent already changed.
alter table wo_build add column if not exists qa jsonb;
alter table wo_build add column if not exists qa_lease_until timestamptz;
create index if not exists wo_build_qa_open on wo_build (site_key) where qa->>'state' in ('pending', 'retry');
