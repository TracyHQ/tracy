-- One setting per running environment/database. Historical catalog snapshots stay read-only.
CREATE TABLE joomla_build_base (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  quickstart text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
