-- Provider display names are independent of adapter routing and credentials.
alter table llm_provider add column if not exists provider_alias text not null default '';
