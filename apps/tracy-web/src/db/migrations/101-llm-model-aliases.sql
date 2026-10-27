-- Display names for deployment-owned models; independent of refreshed vendor catalogs.
alter table llm_provider add column if not exists model_aliases jsonb not null default '{}'::jsonb
  check (jsonb_typeof(model_aliases) = 'object');
