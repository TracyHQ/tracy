-- apps/tracy-web/src/db/migrations/166-wo-place-import.sql
-- Place research shared across deployments, slice 1 (tasks/plan-wo-shared-places.md §6, §9). A
-- sending deployment pushes one place's published snapshot to a receiving master through
-- `POST /api/internal/wo-places/v1/ingest`; the picture bytes are already in the shared bucket
-- (`media/…` keys, `lib/place-media-store.js`), so only rows travel.
--
-- wo_place_import            one row per POST that passed the secret and the size limit, whatever its
--                            outcome (a 404 or 413 leaves none: its body was never read). `origin` is
--                            SELF-DECLARED by the sender: with one shared secret per destination it
--                            says who claims to be the source, not which machine pushed. Moving to
--                            per-machine tokens changes only the secret check, then `origin` can be
--                            taken from the token.
-- wo_place_snapshot_import   which snapshot an import published, and the sender's id for it: the
--                            provenance of an imported snapshot, without a column on the immutable
--                            snapshot tables. Unique per (origin, origin_snapshot_id).
-- wo_place_media_rekey       the old key of a place picture moved into the shared bucket by
--                            `scripts/copy-place-media-to-shared-bucket.mjs`. Rollback is one statement:
--                              update wo_place_media m set object_key = r.old_key
--                              from wo_place_media_rekey r where r.media_id = m.id and m.object_key = r.new_key;
--
-- wo_place_media stays immutable but for revoke, with ONE narrow exception: `object_key` may change
-- when the old and new key end in the same `<sha256>.<ext>` (extension case aside: old backfilled keys kept
-- `.JPG`) and that sha256 is the row's own. Such a
-- move names the same bytes in another store; anything else is still refused.
--
-- Expand-only: new tables, and a guard that refuses less. An older image ignores all of it.
create table if not exists wo_place_import (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  received_at timestamptz not null default now(),
  outcome text not null
    check (outcome in ('imported', 'skipped_existing', 'retry_later', 'conflict', 'media_missing', 'invalid', 'error')),
  place_id uuid references wo_place(id),
  snapshot_id uuid references wo_place_snapshot(id),
  places integer not null default 0,
  snapshots integer not null default 0,
  sources integer not null default 0,
  media_rows integer not null default 0,
  detail jsonb
);
create index if not exists wo_place_import_received on wo_place_import (received_at desc);

create table if not exists wo_place_snapshot_import (
  snapshot_id uuid primary key references wo_place_snapshot(id),
  import_id uuid not null references wo_place_import(id),
  origin text not null,
  origin_snapshot_id uuid not null,
  unique (origin, origin_snapshot_id)
);

create table if not exists wo_place_media_rekey (
  media_id uuid primary key references wo_place_media(id),
  old_key text not null,
  new_key text not null,
  moved_at timestamptz not null default now()
);

create or replace function wo_place_media_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wo_place_media rows are never deleted (revoke them)';
  end if;
  if (to_jsonb(new) - 'revoked_at' - 'revoke_reason' - 'object_key')
       <> (to_jsonb(old) - 'revoked_at' - 'revoke_reason' - 'object_key') then
    raise exception 'wo_place_media is immutable except revoked_at and revoke_reason';
  end if;
  if new.object_key is distinct from old.object_key and not (
       old.object_key is not null and new.object_key is not null
       and lower(substring(old.object_key from '[^/]+$')) = lower(substring(new.object_key from '[^/]+$'))
       and lower(substring(new.object_key from '[^/]+$')) like old.sha256 || '.%'
     ) then
    raise exception 'wo_place_media.object_key may only move to another key of the same bytes';
  end if;
  return new;
end
$$;
