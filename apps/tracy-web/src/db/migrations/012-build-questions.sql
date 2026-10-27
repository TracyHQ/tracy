-- Which questionnaire a NEW site of each CMS is asked, when the archive it starts from brings none.
--
-- The questionnaire itself is data in git, released with the quickstart or shipped as the CMS's
-- default set (tracy-questions/v1); this row only CHOOSES among sets that exist — `standard` (the
-- CMS's own file) or a quickstart id whose catalogue entry carries one. Same shape and same
-- compare-and-swap as `build_base`, for the same reason: two administrators must not overwrite
-- each other's choice unseen.
CREATE TABLE build_questions (
  platform text PRIMARY KEY,
  source text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
