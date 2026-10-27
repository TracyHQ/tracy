-- Shared research hub, publish half: materialized snapshots with field provenance, the change feed, revocations and
-- the suppression registry. Reads the intake tables of 0002 (wo_hub_observation, wo_hub_evidence).

-- One counter row orders every hub change. A publishing transaction updates it as its last step and keeps the row
-- lock until commit, so positions become visible in commit order; a sequence would let a later number commit first
-- and a reader that moved past it would never see the earlier one.
create table wo_hub_feed_state (
    id boolean primary key default true check (id),
    seq bigint not null default 0,
    -- Positions at or below a floor were pruned: a cursor older than its feed's floor has expired.
    change_floor bigint not null default 0,
    revocation_floor bigint not null default 0
);
insert into wo_hub_feed_state default values;

-- The hub's view of a place. Separate from wo_place.current_snapshot_id, which the research pipeline moves.
create table wo_hub_place (
    place_id uuid primary key references wo_place(id),
    state text not null default 'live' check (state in ('live', 'revoked', 'deleted', 'merged')),
    revision bigint not null default 0,
    evidence_revision bigint not null default 0,
    built_evidence_revision bigint not null default -1,
    revocation_revision bigint not null default 0,
    current_snapshot_id uuid references wo_place_snapshot(id),
    content_hash text,
    provenance_hash text,
    cell text,
    merged_into uuid references wo_place(id),
    updated_at timestamptz not null default now()
);
create index wo_hub_place_cell on wo_hub_place (cell, place_id) where state = 'live' and current_snapshot_id is not null;
create index wo_hub_place_dirty on wo_hub_place (place_id) where state = 'live' and evidence_revision <> built_evidence_revision;

-- Hub metadata of a snapshot the hub materialized; the snapshot row itself is wo_place_snapshot (+ _profile).
create table wo_hub_snapshot (
    snapshot_id uuid primary key references wo_place_snapshot(id),
    place_id uuid not null references wo_place(id),
    revision bigint not null,
    evidence_revision bigint not null,
    policy_version text not null,
    content_hash text not null,
    provenance_hash text not null,
    -- Every observation the snapshot shows, chosen or as an alternative: withdrawing one revokes the snapshot.
    observation_ids uuid[] not null,
    observed_at timestamptz,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    revoke_reason text,
    unique (place_id, revision)
);
create index wo_hub_snapshot_observations on wo_hub_snapshot using gin (observation_ids);

create table wo_hub_snapshot_field (
    snapshot_id uuid not null references wo_hub_snapshot(snapshot_id),
    field text not null,
    status text not null check (status in ('chosen', 'weak', 'conflicted')),
    value jsonb,
    blocks_brief boolean not null,
    provenance jsonb not null,
    alternatives jsonb not null default '[]'::jsonb,
    primary key (snapshot_id, field)
);

-- Ordered hub changes. `revision`: for upsert/merge the new place revision; for revoke/delete every copy at or below it
-- is no longer valid.
create table wo_hub_change (
    seq bigint primary key,
    kind text not null check (kind in ('upsert', 'merge', 'revoke', 'delete')),
    place_id uuid not null,
    revision bigint not null,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index wo_hub_change_revocations on wo_hub_change (seq) where kind in ('revoke', 'delete');

-- Observations the hub stopped trusting on its own (linked to the wrong business, revoked by an operator).
create table wo_hub_observation_exclusion (
    observation_id uuid primary key references wo_hub_observation(id),
    reason text not null check (reason in ('mis_linked', 'revoked')),
    actor text not null,
    created_at timestamptz not null default now()
);

-- A business asked to be removed: every identity it was known by, so it never comes back through any of them.
create table wo_hub_suppression (
    id uuid primary key default gen_random_uuid(),
    place_id uuid not null references wo_place(id),
    reason text not null,
    actor text not null,
    created_at timestamptz not null default now()
);
create table wo_hub_suppressed_identity (
    namespace text not null,
    external_id text not null,
    suppression_id uuid not null references wo_hub_suppression(id),
    created_at timestamptz not null default now(),
    primary key (namespace, external_id)
);

create function wo_hub_append_change(p_kind text, p_place uuid, p_revision bigint, p_detail jsonb)
returns bigint language plpgsql as $$
declare position bigint;
begin
  -- The counter row lock is held until this transaction ends; call this as the last write of the transaction.
  update wo_hub_feed_state set seq = seq + 1 where id returning seq into position;
  insert into wo_hub_change (seq, kind, place_id, revision, detail) values (position, p_kind, p_place, p_revision, p_detail);
  return position;
end $$;

-- An observation stops counting: revoke every live snapshot that shows it and announce it at once, before any rebuild.
create function wo_hub_drop_observation(p_observation uuid, p_place uuid, p_reason text)
returns void language plpgsql as $$
declare hit boolean;
declare rev bigint;
begin
  -- Not a revocation_revision bump: a rebuild re-reads the observations, so a running worker may still publish.
  update wo_hub_place set evidence_revision = evidence_revision + 1, updated_at = now()
   where place_id = p_place returning revision into rev;
  with revoked as (
    update wo_hub_snapshot set revoked_at = now(), revoke_reason = p_reason
     where place_id = p_place and revoked_at is null and p_observation = any (observation_ids)
    returning 1)
  select exists (select 1 from revoked) into hit;
  if hit then
    perform wo_hub_append_change('revoke', p_place, rev, jsonb_build_object('scope', 'data', 'reason', p_reason));
  end if;
end $$;

create function wo_hub_observation_changed() returns trigger language plpgsql as $$
declare target uuid;
begin
  select place_id into target from wo_place_identity
   where namespace = new.subject_namespace and external_id = new.subject_external_id;
  if new.status = 'accepted' and exists (
       select 1 from wo_hub_suppressed_identity
        where namespace = new.subject_namespace and external_id = new.subject_external_id) then
    raise exception 'wo_hub: % % was removed at the business''s request', new.subject_namespace, new.subject_external_id;
  end if;
  if target is null then return new; end if;
  insert into wo_hub_place (place_id) values (target) on conflict (place_id) do nothing;
  if tg_op = 'UPDATE' and old.status = 'accepted' and new.status <> 'accepted' then
    perform wo_hub_drop_observation(new.id, target, new.status);
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status <> 'accepted') then
    update wo_hub_place set evidence_revision = evidence_revision + 1, updated_at = now() where place_id = target;
  end if;
  return new;
end $$;
create trigger wo_hub_observation_changed after insert or update of status on wo_hub_observation
  for each row execute function wo_hub_observation_changed();

-- A new identity on a place can bring accepted observations with it.
create function wo_hub_identity_changed() returns trigger language plpgsql as $$
begin
  if exists (select 1 from wo_hub_place where place_id = new.place_id) then
    update wo_hub_place set evidence_revision = evidence_revision + 1, updated_at = now() where place_id = new.place_id;
  end if;
  return new;
end $$;
create trigger wo_hub_identity_changed after insert or update on wo_place_identity
  for each row execute function wo_hub_identity_changed();

-- Published hub content never changes; a snapshot may only be revoked.
create function wo_hub_snapshot_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'wo_hub_snapshot rows are never deleted (revoke them)'; end if;
  if (to_jsonb(new) - 'revoked_at' - 'revoke_reason') <> (to_jsonb(old) - 'revoked_at' - 'revoke_reason') then
    raise exception 'wo_hub_snapshot is immutable except revoked_at and revoke_reason';
  end if;
  return new;
end $$;
create trigger wo_hub_snapshot_immutable before update or delete on wo_hub_snapshot
  for each row execute function wo_hub_snapshot_guard();

create function wo_hub_snapshot_field_guard() returns trigger language plpgsql as $$
begin raise exception 'wo_hub_snapshot_field rows are immutable'; end $$;
create trigger wo_hub_snapshot_field_immutable before update or delete on wo_hub_snapshot_field
  for each row execute function wo_hub_snapshot_field_guard();
