-- How a Help answer ended, when it did not finish: 'stopped' (the asker's side ended the stream, Stop or
-- a closed page) or 'cut' (the provider failed or the deadline passed). NULL is a finished answer, so
-- every row written before keeps reading as one. Its text is kept either way; a restore shows the
-- state and offers Retry (#206). Expand-only: an older image ignores it.
alter table assistant_turn add column if not exists ended text check (ended in ('stopped', 'cut'));
