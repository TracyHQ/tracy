-- Google Places answers kept for every Find, signed-in and sign-in-free (`lib/places-cache.js`),
-- `placesCacheDays` long (23/10/2026: Google bills per call and lets results be kept). The key is
-- a hash of the request without its API key or session token; never any account's data.
create table if not exists wo_places_cache (
  key text primary key,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists wo_places_cache_expires on wo_places_cache (expires_at);
