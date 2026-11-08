-- The chat sessions a Tracy setup run opened for its own work (step 9b repairs, ADR 0044 decision 30).
--
-- A step chain build repairs the written site through Tracy's site agent, one dsh session per page. Those sessions are
-- the build's, not the customer's: the server writes the pair here when it opens one, before any prompt reaches it.
--   - the Apply door reads it to record a write made in that session as Tracy setup under the run (`site_write.origin`),
--     never from a header, which only names a session;
--   - Site changes reads it to keep such a session's turns out of the list, so the run shows as one "Tracy setup" row.
create table if not exists setup_session (
  site_key text not null,
  session_id text not null,
  run_id text not null,
  created_at timestamptz not null default now(),
  primary key (site_key, session_id)
);

create index if not exists setup_session_run on setup_session (site_key, run_id);
