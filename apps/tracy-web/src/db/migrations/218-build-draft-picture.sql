-- The pictures the build chat's research stores before a site exists (#609, `build-draft/pictures.js`): each one
-- downloaded and measured by the Website Opportunities media rules (`media-store.js`) and kept in the artifact store
-- under `build-drafts/<account>/<sha256>.<ext>`. The draft's asset manifest names them by `id` (origin `draft`); a
-- picture step opens one through `openDraftPicture` (`build-draft-gather-wiring.js`). No `wo_*` row is written for them.
--   research_run  the research run that last stored it; a newer research keeps only its own pictures
--   one row per picture bytes of an account (`account_id`, `sha256`), so a research again reuses its id
-- The rows go with the draft (and the account); the stored objects are deleted by the research that replaces them,
-- not by an account deletion (no object cleanup hook exists for that yet).
-- Expand-only: an older image never reads the table.
create table if not exists build_draft_picture (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references build_draft(account_id) on delete cascade,
  research_run uuid not null,
  kind text not null check (kind in ('image', 'video')),
  category text,
  source text not null,
  source_url text not null,
  post_id text,
  posted_at timestamptz,
  caption text,
  alt text,
  sha256 text not null,
  object_key text not null,
  mime text not null,
  bytes integer not null check (bytes > 0),
  width integer,
  height integer,
  duration_s numeric,
  palette jsonb,
  dhash text,
  labels jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, sha256)
);
create index if not exists build_draft_picture_run on build_draft_picture (account_id, research_run);
