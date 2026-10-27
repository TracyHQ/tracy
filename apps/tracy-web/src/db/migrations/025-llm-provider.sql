-- Which model providers this deployment holds credentials for, and which job each one does.
--
-- WHY IN THE DATABASE AT ALL. Every other credential this app reads arrives in the environment and
-- is read once at boot (`config.js`), which means rotating one is an ssh, an edit and a restart —
-- on a machine most of the team cannot reach. A key that has run out of money is an outage the
-- person who can see it is usually not the person who can fix it. These two tables are what let
-- `/ops` do it.
--
-- 🔒 THE KEY IS SEALED, NOT STORED (`lib/secret-box.js`): AES-256-GCM under a key derived from
-- SESSION_SECRET. Not because the database is untrusted by this process — it can open every row it
-- sealed — but because a dump, a backup and a replica are all copies of this table, and a plaintext
-- credential in each of them is a credential with no boundary at all. Rotating SESSION_SECRET makes
-- the sealed keys unopenable and the screen shows those providers as having no key; that is
-- recoverable by typing them again, and it is written down in secret-box.js.
--
-- 🔒 A ROW IS A DELTA OVER `lib/llm-catalog.js`, NOT A COPY OF IT. `preset_id` names the catalog
-- entry; `base_url` is null unless somebody overrode ours. Copying the preset in would freeze it:
-- the day a vendor moves its address, every deployment keeps calling the old one and nothing says
-- why. Same rule `tracy-desk` arrived at after doing it the other way first.
--
-- No seed row, on purpose. A fresh deployment has no provider configured and every door falls back
-- to the environment variables it already read — so this table arriving changes nothing until
-- somebody uses the screen.
create table llm_provider (
  -- The catalog id for a preset, or `custom:<slug>` for one somebody added by hand.
  id text primary key,
  -- Which catalog entry this configures; null means fully custom (nothing to read defaults from).
  preset_id text,
  name text not null,
  -- null = use the catalog's. A trailing `#` means "leave my URL alone" (llm-catalog.js).
  base_url text,
  -- `v1.<iv>.<tag>.<ciphertext>`, or null for "no key set". Never plaintext, never an empty string:
  -- sealSecret refuses to seal one, so that `configured` cannot read true for a provider that
  -- could not authenticate anything.
  api_key_cipher text,
  -- Off by default. A provider somebody is halfway through configuring must not start answering
  -- customers' traffic because a form was saved.
  enabled boolean not null default false,
  -- What `Get model list` last read from this provider: [{ id, name }]. A cache for a picker, never
  -- a gate — a model absent from here is still accepted if somebody types it.
  models jsonb not null default '[]',
  models_read_at timestamptz,
  revision integer not null default 1,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

-- Which provider (and which model) answers each of the four jobs in `LLM_DOORS`.
--
-- One row per door, not a column per door on the provider: a provider may answer several jobs, and
-- a job must name exactly one provider. `on delete restrict` — removing a provider that is still
-- doing a job has to be a decision on screen, not a silent reassignment to nothing.
create table llm_assignment (
  door text primary key check (door in ('web', 'seedText', 'seedImage', 'agent')),
  provider_id text not null references llm_provider(id) on delete restrict,
  -- null for the `agent` door: Tracy rotates its key, the dsh runtime chooses its model.
  model text,
  revision integer not null default 1,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
