-- The build chat's generation per account (`build-draft/fresh-start.js`): the number the build session ID is derived
-- with (`workspace/build-chat-session.js`), so a fresh start gives the account a new, empty build conversation while
-- the browser still never chooses an ID. An account with no row is at generation 0, the ID every account had before
-- this table. Raised by one when the owner starts over, or when `/new/build` finds the build stopped for good; the
-- draft row of the earlier generation is removed in the same transaction (its pictures go with it, by cascade).
-- Expand-only: an older image never reads it, and keeps opening generation 0.
create table if not exists build_chat_generation (
  account_id uuid primary key references account(id) on delete cascade,
  generation integer not null check (generation >= 0),
  updated_at timestamptz not null default now()
);
