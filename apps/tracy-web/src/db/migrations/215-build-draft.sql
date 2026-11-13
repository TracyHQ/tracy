-- The pre site build draft (#603, `build-draft/store.js`): what a customer building a site from the chat has said and
-- chosen before any site exists. It is tied to the account, not to a website opportunity or a site, and it holds the
-- Contract B documents (#590) as they are: the questions asked and their answers, the chosen template and the one
-- living plan (no version list). `last_edit` is the last plan edit applied; `undo_edit` is the Contract B edit that
-- takes it back (one step of undo), cleared once used and replaced by each new edit. One draft per account this round.
-- Expand-only: an older image never reads it.
create table if not exists build_draft (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references account(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  template jsonb,
  plan jsonb,
  last_edit jsonb,
  undo_edit jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
