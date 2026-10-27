-- One default base per CMS, not one for Joomla and nothing for the rest.
--
-- `joomla_build_base` was a singleton because Joomla was the only platform whose sites started
-- from an archive. EmDash now does too — its base quickstart IS the template a new site wears
-- (`tracy-business/emdash`) — and WordPress will when `tracy-base/wp7` lands. A second singleton
-- table per CMS would be the same row shape three times, and the screen that reads it would have
-- to know which name to ask for; the platform belongs IN the key.
--
-- The existing Joomla selection is carried over with its revision, because that number is the
-- compare-and-swap one administrator's save checks against another's: resetting it would let a
-- stale browser tab overwrite a selection it never saw.
CREATE TABLE build_base (
  platform text PRIMARY KEY,
  quickstart text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO build_base (platform, quickstart, revision, updated_by, updated_at)
SELECT 'joomla', quickstart, revision, updated_by, updated_at FROM joomla_build_base;

DROP TABLE joomla_build_base;
