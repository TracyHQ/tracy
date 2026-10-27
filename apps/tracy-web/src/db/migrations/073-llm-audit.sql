-- WHO CHANGED THE MODEL BOOK, AND WHAT (07/10/2026).
--
-- `llm_provider` and `llm_assignment` keep only the LAST writer in `updated_by`. A key that was
-- replaced, a provider switched off at 3 a.m. or a door moved to another vendor left no trace of what it
-- had been; an operator asking "why did the questionnaire stop working on Tuesday" had nothing to read.
--
--   llm_audit   one row per write to the book, append only
--       at        when
--       actor     the email that pressed
--       action    `provider.save` · `provider.delete` · `door.assign` · `door.clear` · `keys.push`
--       subject   the provider id or the door
--       detail    what changed, with NO key and NO key hint: the names of the fields and their new
--                 non-secret values (enabled, address, model)
--
-- 🔒 A new table: no scan, no backfill. Rows older than a year are swept by the hourly job.
create table if not exists llm_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  subject text not null,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists llm_audit_at on llm_audit (at desc);
