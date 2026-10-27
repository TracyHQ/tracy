-- Generated questionnaires, the capability snapshots they were generated against, the jobs that
-- made them, and the snapshot a Build form was served (22/09/2026, the Generate/Re-generate task).
--
-- 🔒 A DRAFT IS A ROW LIKE ANY OTHER CANDIDATE. `question_set` already holds released and custom
-- sets side by side, and `question_choice` says which one customers meet. A generated set is one
-- more source ('generated'), and generating it changes NOTHING in `question_choice` — the
-- administrator's Use is the only thing that does. So no "active" flag is added here: in use IS
-- the row `question_choice` names, and everything else is, by that fact, a draft.
--
-- Nothing below rewrites an existing row's meaning: a legacy choice keeps pointing at the same
-- set, and a set with no `content_hash` is hashed on first read.
alter table question_set
  -- sha256 of the canonical JSON of `doc` — the identity of the CONTENT, which is what Use is
  -- compare-and-swapped on (the revision alone says "changed", not "changed to what you saw").
  add column content_hash text,
  -- The candidate this one was made from: the set a Re-generate or an edit-of-active started at.
  add column base_set_id text,
  -- How it came to be: capability hash, request id, prompt/schema versions, model and provider as
  -- the shared model layer reported them, usage when it was reported. Null for released/custom.
  add column provenance jsonb;

-- 🔒 A CHOICE MAY NAME THE CMS'S OWN SET, WHICH HAS NO ROW. `<cms>@standard` is composed in code
-- (a copy in the table would be a second truth), so the foreign key that tied a choice to a
-- `question_set` row made "ask the standard set" impossible to record — measured 22/09: the
-- insert died on this constraint, which is why an explicit standard selection never survived.
-- The delete door already refuses to remove a set in use; that check stays, the constraint goes.
alter table question_choice drop constraint question_choice_set_id_fkey;

-- What a release was read as, keyed by the hash of the reading. A generated set names one of
-- these; a release whose files change reads to another hash, and the set is stale against it.
create table capability_snapshot (
  hash text primary key,
  owner text not null,
  version text,
  doc jsonb not null,
  created_at timestamptz not null default now()
);
create index capability_snapshot_owner on capability_snapshot (owner);

-- One Generate or Re-generate press. The request id is chosen by the presser, so a double press
-- or a reload finds its job instead of starting a second one; the same id with a different input
-- is a conflict, not a second job.
create table question_generation (
  request_id text primary key,
  owner text not null,
  mode text not null,
  base_set_id text,
  base_revision integer,
  feedback text,
  -- sha256 of the canonical input (mode, base content hash, feedback, capability hash, versions).
  input_hash text not null,
  capability_hash text not null,
  -- 'running' | 'done' | 'failed' | 'cancelled'. A 'running' row older than `deadline_at` after
  -- a restart is a job the process died under: it is marked failed with a reason, never re-run
  -- by itself — the press is the customer's, and so is pressing again.
  status text not null,
  attempts integer not null default 0,
  result_set_id text,
  error jsonb,
  usage jsonb,
  trace jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  finished_at timestamptz
);
create index question_generation_owner on question_generation (owner, created_at desc);

-- The questionnaire a Build form was SERVED, by the hash of its content. A build that starts
-- from that form carries this hash, and its submit is judged against these questions — not
-- against whatever the administrator has chosen since.
create table question_snapshot (
  content_hash text primary key,
  set_id text,
  revision integer,
  doc jsonb not null,
  created_at timestamptz not null default now()
);
