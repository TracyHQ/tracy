-- Provider profiles are independent; the existing ElevenLabs cipher and environment fallback survive.
alter table speech_setting add column provider text not null default 'elevenlabs'
  check (provider in ('elevenlabs', 'voicestudio'));
alter table speech_setting add column profiles jsonb not null default '{}'::jsonb;
alter table speech_setting add column revision bigint not null default 1;
