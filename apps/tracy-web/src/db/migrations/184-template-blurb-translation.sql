-- Translations of a template card's English blurb for the public Templates pages
-- (`lib/template-blurb-translations.js`). Keyed by the sha256 of the English text, never by template:
-- the English lives on the release (`quickstart_releases.inspiration`, rewritten by every read of the
-- releases), so a changed blurb has a new key and is translated again, and the old rows simply stop
-- being read.
create table if not exists template_blurb_translation (
  source_sha256 text not null,
  lang text not null,
  text text not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (source_sha256, lang)
);

-- One row per English blurb whose last translation call failed or had a language rejected. The sweep
-- skips it until `next_at`, which doubles with each failure, so a broken or misbehaving model is not
-- asked again on every read of the releases. A clean answer deletes the row.
create table if not exists template_blurb_translation_failure (
  source_sha256 text primary key,
  failures integer not null default 1,
  next_at timestamptz not null,
  last_error text,
  updated_at timestamptz not null default now()
);
