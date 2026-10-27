-- Litescrape is server-only. Clearing the sealed override restores the environment fallback.
alter table wo_ops_setting add column if not exists litescrape_key_cipher text;
alter table wo_place_identity drop constraint if exists wo_place_identity_namespace_check;
alter table wo_place_identity add constraint wo_place_identity_namespace_check
  check (namespace in ('google', 'osm', 'url', 'merge', 'tripadvisor'));
