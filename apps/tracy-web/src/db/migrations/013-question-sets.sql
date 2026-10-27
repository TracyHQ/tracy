-- A questionnaire an administrator edited on this server, one row per owner.
--
-- `owner` is a quickstart id (`tracy-business/emdash`) or a CMS (`wordpress`) — the same names the
-- released files carry. A row here WINS over the released file for sites created on this server;
-- deleting the row is "reset to released". The document is the whole tracy-questions/v1 set, kept
-- as JSON so the same validator the gate runs can refuse a bad one before it is stored. Revision
-- is the compare-and-swap two administrators editing the same set need (15/09: the admin
-- page manages this; git keeps the released default).
CREATE TABLE question_sets (
  owner text PRIMARY KEY,
  doc jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
