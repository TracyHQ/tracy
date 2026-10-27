-- The operator's User Interface switches: which pieces of the customer's dsh page are hidden
-- (`/ops` › User Interface, `tasks/plan-ui-switches.md`). One row for the whole deployment.
--
-- `overrides` holds ONLY the switches an operator set away from their code default
-- (`@tracy/core/ui-switches/catalogue.json`), as `{ "<id>": true|false }`. A switch added later
-- therefore arrives with its own default instead of an answer nobody gave, and a switch pressed back
-- to its default leaves the document. No seed row: a missing row reads as "all defaults".
create table ui_setting (
  id boolean primary key default true check (id),
  overrides jsonb not null default '{}'::jsonb,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
