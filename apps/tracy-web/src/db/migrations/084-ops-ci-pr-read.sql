-- Read state belongs to the signed-in Tracy account, across browsers and GitHub author filters.
-- Missing rows and null read_at mean unread. CI updates do not silently undo a person's choice.
create table ops_ci_pr_read (
  account_id uuid not null references account(id) on delete cascade,
  repo text not null,
  pr_number integer not null check (pr_number > 0),
  read_at timestamptz,
  primary key (account_id, repo, pr_number)
);
