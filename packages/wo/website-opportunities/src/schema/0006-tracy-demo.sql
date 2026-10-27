-- The `tracy` builder (`src/plugins/builders/tracy.js`): each demo this server asked Tracy to build, one row per
-- request. The request body and its idempotency key are kept, so a retry after a timeout sends the same bytes under
-- the same key and Tracy answers the demo it already made instead of building a second one.
create table wo_tracy_demo (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references wo_principal(id) on delete cascade,
    opportunity_id uuid not null references wo_opportunity(id) on delete cascade,
    idempotency_key text not null unique,
    -- The exact bytes sent: a retry must send the same body, and jsonb would reorder its keys.
    request text not null,
    -- `submitting` until Tracy confirms it; `refused` when Tracy said no before taking it (limit, budget).
    status text not null check (status in
        ('submitting', 'queued', 'building', 'needs-review', 'ready', 'failed', 'cancelled', 'refused')),
    demo_id text,
    site jsonb,
    expires_at timestamptz,
    frozen_at timestamptz,
    deleted_at timestamptz,
    error jsonb,
    -- When the tick asks Tracy again (Retry-After, back-off); null when nothing is left to ask.
    next_poll_at timestamptz,
    attempts integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- At most one demo per opportunity that is being built or is live: a second press answers the first.
create unique index wo_tracy_demo_one_active on wo_tracy_demo (opportunity_id)
    where status in ('submitting', 'queued', 'building', 'needs-review')
       or (status = 'ready' and deleted_at is null);
create index wo_tracy_demo_opportunity on wo_tracy_demo (opportunity_id, created_at desc);
create index wo_tracy_demo_due on wo_tracy_demo (next_poll_at) where next_poll_at is not null;
