-- The settings that belong to the Tracy Cowork desktop app alone (`/ops` › User Interface ›
-- Desktop App, `tasks/todo-desktop-surface.md` part A). Every other area of that screen applies to
-- the app as it is: the app opens the same customer page, so this table never repeats a switch.
--
-- One row for the whole deployment. `config` holds `{ "llm": { "connect": bool, "providers": [id] } }`
-- (`src/lib/desktop-setting.js` owns the keys and their defaults). No seed row: a missing row reads
-- as the defaults — plan connection on, every vendor offered.
--
-- ⚠ ADVICE TO THE APP, NOT A GATE. The app runs on the customer's machine and reads this through a
-- public door; what keeps a customer's plan off a shared host is the fleet image, which never turns
-- the LLM sign-in on (gate `image-profile`).
create table desktop_setting (
  id boolean primary key default true check (id),
  config jsonb not null default '{}'::jsonb,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
