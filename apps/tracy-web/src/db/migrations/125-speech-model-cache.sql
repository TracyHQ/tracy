-- Discovery metadata is independent of active profile revisions and never contains credentials.
create table speech_model_cache (
  provider text primary key check (provider in ('elevenlabs', 'voicestudio')),
  models jsonb not null default '[]'::jsonb,
  read_at timestamptz not null,
  fingerprint text not null
);
