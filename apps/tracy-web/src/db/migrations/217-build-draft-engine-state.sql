-- The engine doors of the build chat (#609, `build-draft/engine-route.js`) run their work in the background and keep
-- the state of the latest step in the draft, so `GET /api/build-draft/engine` answers it after the request that started
-- it has ended, and a process restart leaves a stopped step with a fault rather than a step running forever.
--   engine  {step, state, runner, startedAt, endedAt?, say?, reason?}: `runner` names the process that runs it
-- The build model door (`buildModel`, `lib/llm-catalog.js`) joins the doors an assignment may name: one model for the
-- build engine's text and vision calls. The list below is `LLM_DOORS` exactly (same shape as migration 205).
-- Expand-only: an older image never reads the column, and the door list only grows.
alter table build_draft add column if not exists engine jsonb;

alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'assistant', 'seedText', 'seedImage', 'agent', 'vision', 'woEditorial', 'sitePlanner',
                  'brandAgent', 'brandReviewer', 'siteWriter', 'picturePicker', 'pictureIconRanker',
                  'pictureLooker', 'pictureDrawer', 'buildModel'));
