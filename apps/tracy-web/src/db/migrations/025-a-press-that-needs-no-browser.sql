-- What a press asked for, kept where a browser is not needed to remember it.
--
-- `go()` in the Build form reports `creating`, then POLLS the provision, and only when that poll
-- says `done` does it call `startBuild` -- the one call that carries the customer's answers into
-- the site. The poll lives in a promise owned by the page. A reload, a navigation, a workspace
-- switch, and it is gone: the chat's to-do list freezes at the last step it managed to report and
-- the build is never started. Nothing errors.
--
-- Measured 22/09/2026 on three sites built through Design inspiration, one per CMS: all three
-- provisioned and serving, all three still wearing the template's demo content, and
-- `docs/agents/build/` absent on every one.
--
-- The client half of the fix resumes the press when the page comes back. This is the other half,
-- for when it does not: with the answers written down here, the provision sweep can start the
-- build itself, from a process no customer has to keep open.
--
--   `press`            what the press asked for: the answers, the inspiration, the design plan.
--                      Null for a row whose press has not happened yet -- a claim writes none.
--   `session_id`       the chat session the build belongs to. A build is OWNED by a session
--                      (`ownerSessionId` in the plugin's job), so a sweep that starts one must
--                      name the same session the claim made ahead, not invent a second.
--   `build_started_at` stamped when anything -- browser or sweep -- has started the build, so the
--                      sweep starts it AT MOST ONCE. Without it a slow build would be started
--                      again on the next tick, and two builds on one site is worse than none.
alter table site_creation add column if not exists press jsonb;
alter table site_creation add column if not exists session_id text;
alter table site_creation add column if not exists build_started_at timestamptz;
