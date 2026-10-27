-- A template waiting on an account (plan tasks/todo-tai-joomlart-qua-tracy.md, B6). Written by the
-- JoomlArt sign-in door when the round was started for `/new?template=<id>`; read by the root
-- landing of a signed-in viewer (a Tracy Desktop that signed in through its own round lands on `/`
-- and is sent to that template's page) and consumed by the template landing page. One row per
-- account, the newest wins; a row older than seven days is ignored. Never a person/device
-- identifier: the template id and a time.
create table desktop_intent (
  account_id uuid primary key references account(id) on delete cascade,
  template text not null,
  created_at timestamptz not null default now()
);
