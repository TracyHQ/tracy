-- The AI Assistant (05/10/2026): a chat with Tracy in the corner of the customer's page
-- that explains the product and the asker's own sites, and points at the screen that does the job.
--
-- TWO CHANGES, ONE FEATURE.
--
-- 1. Its own job on the Model & AI screen. The assistant runs in this process and talks to a
--    customer turn after turn, so its cost and its latency are a different trade from the other
--    jobs here: an administrator must be able to pin it to a cheap, fast model without moving
--    Translate or card drafts with it. Unassigned borrows the `web` door, exactly as `questions`
--    does (026): a deployment that has `web` working gets a working assistant without a second
--    thing to configure.
--
-- 2. Where a conversation is kept. OWNED BY THE ACCOUNT, never by a workspace or a site: a turn can
--    mention several of the asker's sites, and a teammate on one of them has no business reading
--    the rest. The server reads history back only for the account that wrote it, and the model is
--    never handed a turn the request itself did not prove belongs to the caller. `content` is the
--    text a person typed or the text the model answered — never the context block the server
--    builds per turn, so revoking a seat stops new answers about that site at once (the context is
--    rebuilt from live grants on every turn), even inside an old conversation.
alter table llm_assignment drop constraint llm_assignment_door_check;
alter table llm_assignment
  add constraint llm_assignment_door_check
  check (door in ('web', 'seedText', 'seedImage', 'agent', 'questions', 'assistant'));

create table assistant_turn (
  id bigserial primary key,
  conversation_id uuid not null,
  account_id uuid not null references account(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Which model answered, for an assistant turn; null on the person's own.
  model text,
  created_at timestamptz not null default now()
);
create index assistant_turn_conversation on assistant_turn (account_id, conversation_id, id);
create index assistant_turn_created on assistant_turn (created_at);
