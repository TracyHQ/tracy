-- Shared research hub, CLIENT side: what this server keeps from a hub it reads (`HUB_URL`). Nothing here is ever sent
-- back; the hub's own tables (0002, 0003) stay empty on a server that only reads one.

-- The local cache of hub places: the last served snapshot (the public DTO) and its ETag. A revocation empties `dto`
-- and stamps `revoked_at`; the row stays so the same place is not cached again from an old copy.
create table wo_hub_client_place (
    hub_place_id uuid primary key,
    revision bigint not null,
    etag text,
    dto jsonb,
    fetched_at timestamptz not null default now(),
    revoked_at timestamptz,
    revoke_kind text check (revoke_kind in ('revoke', 'delete', 'merge', 'gone'))
);

-- Which identities named which hub place when it was looked up.
create table wo_hub_client_identity (
    namespace text not null,
    external_id text not null,
    hub_place_id uuid not null references wo_hub_client_place(hub_place_id),
    primary key (namespace, external_id)
);

-- Local place snapshots that took facts from a hub place: a revocation marks them, so a brief made later leaves those
-- facts out (a published snapshot itself never changes).
create table wo_hub_client_use (
    snapshot_id uuid not null references wo_place_snapshot(id),
    hub_place_id uuid not null references wo_hub_client_place(hub_place_id),
    hub_revision bigint not null,
    source text not null,
    used_at timestamptz not null default now(),
    revoked_at timestamptz,
    primary key (snapshot_id, hub_place_id)
);
create index wo_hub_client_use_place on wo_hub_client_use (hub_place_id);

-- The cursors of the hub feeds this server follows (`changes`, `revocations`), one row per feed.
create table wo_hub_client_cursor (
    feed text primary key check (feed in ('changes', 'revocations')),
    cursor text not null,
    updated_at timestamptz not null default now()
);

-- Contributions waiting to be sent (`HUB_CONTRIBUTE=1`). The row id is the idempotency key, so a retry after a lost
-- answer is the same contribution on the hub.
create table wo_hub_client_outbox (
    id uuid primary key default gen_random_uuid(),
    place_id uuid not null references wo_place(id),
    body jsonb not null,
    created_at timestamptz not null default now(),
    attempts integer not null default 0,
    next_at timestamptz not null default now(),
    sent_at timestamptz,
    receipt_id uuid,
    last_error text
);
create index wo_hub_client_outbox_due on wo_hub_client_outbox (next_at) where sent_at is null;

-- A website link a hub snapshot gave (`evidence.hubPlaceId`); a revocation of that place deletes it.
alter table wo_place_link drop constraint wo_place_link_verified_by_check;
alter table wo_place_link add constraint wo_place_link_verified_by_check
    check (verified_by = any (array['identity', 'google', 'website', 'operator', 'osm', 'search', 'hub']));
