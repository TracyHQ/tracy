-- The releases on ja-products as this server last read them, and the questionnaires a quickstart
-- may be asked with (ADR 0017: the release is the quickstart).
--
-- 🔒 THIS IS A CACHE WITH A JOB, NOT A COPY OF GITHUB. Every row is written by a read of the GitHub
-- API and is replaced by the next one. It exists so that the screen and the create door keep
-- working when GitHub does not answer — and so `fetched_at` can say out loud how old the answer is.
-- Nothing here is authored by a person; nothing here survives a release being deleted upstream.
create table quickstart_releases (
  -- The tag IS the quickstart id — `tracy-business/emdash-0.x`, `tracy-base/wp7`.
  tag text primary key,
  -- What GitHub said about the release: name, draft/prerelease, published_at, the asset list. Kept
  -- whole so a screen can show a release Tracy cannot read, which is most of them today (78 of 85).
  release jsonb not null,
  -- The parsed `tracy_setting.json`, or null when the release carries none or carries a bad one.
  setting jsonb,
  -- Tracy's own verdict, the third of the three independent axes the screen draws (the other two,
  -- `kind` and the GitHub state, are read off `release`): 'ready' | 'no-setting' | 'invalid'.
  tracy text not null,
  -- Why, in one sentence, when `tracy` is not 'ready'. Shown as it is; never composed on the page.
  reason text,
  fetched_at timestamptz not null default now()
);

-- Every questionnaire a quickstart COULD be asked with, and which one it IS asked with.
--
-- 🔒 CANDIDATES, NOT AN OVERRIDE (15/09). The first shape of this table — one row per owner,
-- winning over the released file — could not answer "which released set was this edited from", so a
-- new release lost to an old edit in silence. Now a released file that changes ADDS a row; an
-- administrator's set stays its own row; and one row per owner in `question_choice` says which of
-- them customers actually meet. Nothing is ever overwritten by a read of GitHub.
create table question_set (
  id text primary key,
  -- The quickstart tag, or a CMS name for the set a Build plugin ships.
  owner text not null,
  -- What the screen calls it: 'Released 1.0.0', 'Sales team wording', 'Standard EmDash'.
  name text not null,
  -- 'released' (came from a tracy_site_question.json), 'custom' (written here), 'standard' (the
  -- Build plugin's own file, recorded so a choice can name it).
  source text not null,
  -- For a released set: the release version it arrived with, and the sha256 of the file it came
  -- from — the fingerprint that decides whether a later read is the same set or another candidate.
  version text,
  sha256 text,
  -- The whole tracy-questions/v1 document. Null for 'standard': that one lives in the image, and a
  -- copy here would be a second truth that drifts.
  doc jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create index question_set_owner on question_set (owner);
create unique index question_set_released on question_set (owner, sha256) where source = 'released';

-- Which candidate this server asks for, per owner. Absent means the server's own default rule
-- (the released set, else the CMS's standard one) — a table row is a DECISION, not a default.
create table question_choice (
  owner text primary key,
  set_id text not null references question_set (id) on delete restrict,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);

-- The old shape goes. It has never run outside this repository (013 landed on 15/09 and was not
-- deployed), so there is nothing to carry over — and carrying it would carry the ambiguity with it.
drop table if exists question_sets;

-- What a site was actually built from. Three columns rather than one, because "which quickstart"
-- stops being answerable the moment a tag points at a new version: the version and the checksum are
-- what a person needs when a site behaves unlike its siblings.
alter table site
  add column quickstart_tag text,
  add column quickstart_version text,
  add column quickstart_sha256 text;
