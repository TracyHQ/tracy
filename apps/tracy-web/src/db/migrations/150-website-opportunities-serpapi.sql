-- SerpApi is server-only; the sealed Settings override takes precedence over the environment.
alter table wo_ops_setting add column if not exists serpapi_key_cipher text;
