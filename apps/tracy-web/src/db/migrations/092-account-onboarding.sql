-- When the account closed the Getting started screen (11/10/2026, `tasks/todo-web-onboard.md`,
-- ADR 0030). Null = never closed it: the web shows the screen once after sign-in. Set by
-- `POST /api/onboarding` (`src/onboarding/route.js`) when the person presses Done or Skip, on the
-- web or in the desktop app; never cleared (reopening from the account menu reads nothing here).
-- Accounts made before this column start null, so each sees the screen once.
alter table account add column onboarding_completed_at timestamptz;
