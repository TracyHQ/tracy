-- A published place snapshot is what every account's research and brief cites, so the database keeps it as it was
-- published (like wo_place_media and wo_social_snapshot). Written idempotently: a host that ran the same file in its
-- own migration chain before adopting this schema can run it again without effect.
--
-- wo_place_snapshot: id, place, run, base and creation time never change. A snapshot still `preparing` belongs to its
-- run; after that only `published` -> `superseded` moves, and a published or superseded snapshot is never deleted.
-- Its parts (_source, _profile, _media, _import) change freely until the snapshot is published or superseded (a failed
-- one was never cited), and may be written in the same transaction that publishes it (an import or backfill). After
-- that nothing is added, deleted or edited, except a source's scheduling facts, a page named for the next run (a
-- source row or ref with nothing collected), (attempted_at, last_error, coverage,
-- collected_at, collector_version: a later run that found the same data carries its tries over) and an operator's
-- verdict on a page a social search found (verdict, judgedBy, judgedAt of an element of collected.pages).
-- Media revocation is a fact of wo_place_media (revoked_at), so it never touches a snapshot.

CREATE OR REPLACE FUNCTION wo_place_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.state in ('published', 'superseded') then
      raise exception 'place snapshot guard: a published wo_place_snapshot is never deleted';
    end if;
    return old;
  end if;
  if row(new.id, new.place_id, new.job_id, new.base_snapshot_id, new.created_at)
     is distinct from row(old.id, old.place_id, old.job_id, old.base_snapshot_id, old.created_at) then
    raise exception 'place snapshot guard: a wo_place_snapshot keeps its place, run and base';
  end if;
  if old.state = 'preparing' then
    return new;
  end if;
  if row(new.published_at, new.enrichment_scope) is distinct from row(old.published_at, old.enrichment_scope)
     or not (new.state = old.state or (old.state = 'published' and new.state = 'superseded')) then
    raise exception 'place snapshot guard: a % wo_place_snapshot only moves from published to superseded', old.state;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION wo_place_snapshot_part_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  held text;
  mine boolean;
  before_doc jsonb;
  after_doc jsonb;
begin
  if tg_op <> 'INSERT' then
    select s.state into held from wo_place_snapshot s where s.id = old.snapshot_id;
    if held in ('published', 'superseded') then
      if tg_op = 'DELETE' then
        raise exception 'place snapshot guard: % rows of a published wo_place_snapshot are never deleted', tg_table_name;
      end if;
      before_doc := to_jsonb(old);
      after_doc := to_jsonb(new);
      if tg_table_name = 'wo_place_snapshot_source' then
        before_doc := before_doc - 'attempted_at' - 'last_error' - 'coverage' - 'collected_at' - 'collector_version';
        after_doc := after_doc - 'attempted_at' - 'last_error' - 'coverage' - 'collected_at' - 'collector_version';
        -- Naming a page for the next run: a ref given to a row that had none and holds nothing collected.
        if old.ref is null and old.collected = '{}'::jsonb and old.collected_at is null and new.collected = '{}'::jsonb then
          before_doc := before_doc - 'ref';
          after_doc := after_doc - 'ref';
        end if;
        if jsonb_typeof(old.collected -> 'pages') = 'array' then
          before_doc := jsonb_set(before_doc, '{collected,pages}', (
            select coalesce(jsonb_agg(case when jsonb_typeof(p) = 'object'
                                           then p - 'verdict' - 'judgedBy' - 'judgedAt' else p end order by o),
                            '[]'::jsonb)
              from jsonb_array_elements(old.collected -> 'pages') with ordinality e(p, o)));
        end if;
        if jsonb_typeof(new.collected -> 'pages') = 'array' then
          after_doc := jsonb_set(after_doc, '{collected,pages}', (
            select coalesce(jsonb_agg(case when jsonb_typeof(p) = 'object'
                                           then p - 'verdict' - 'judgedBy' - 'judgedAt' else p end order by o),
                            '[]'::jsonb)
              from jsonb_array_elements(new.collected -> 'pages') with ordinality e(p, o)));
        end if;
      end if;
      if after_doc is distinct from before_doc then
        raise exception 'place snapshot guard: % of a published wo_place_snapshot only changes its scheduling facts',
          tg_table_name;
      end if;
      return new;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
  end if;
  -- A row added to (or moved into) a snapshot: the snapshot is still preparing, or this transaction wrote it.
  select s.state, age(s.xmin) = 0 into held, mine from wo_place_snapshot s where s.id = new.snapshot_id;
  if held in ('published', 'superseded') and not mine then
    -- A source row that only names a page (nothing collected) is the next run's plan, not published content.
    if tg_table_name = 'wo_place_snapshot_source' then
      if to_jsonb(new) -> 'collected' = '{}'::jsonb and to_jsonb(new) -> 'collected_at' = 'null'::jsonb then
        return new;
      end if;
    end if;
    raise exception 'place snapshot guard: nothing is added to a published wo_place_snapshot (%)', tg_table_name;
  end if;
  return new;
end
$function$;

DROP TRIGGER IF EXISTS wo_place_snapshot_immutable ON wo_place_snapshot;
CREATE TRIGGER wo_place_snapshot_immutable BEFORE DELETE OR UPDATE ON wo_place_snapshot
  FOR EACH ROW EXECUTE FUNCTION wo_place_snapshot_guard();
DROP TRIGGER IF EXISTS wo_place_snapshot_source_immutable ON wo_place_snapshot_source;
CREATE TRIGGER wo_place_snapshot_source_immutable BEFORE INSERT OR DELETE OR UPDATE ON wo_place_snapshot_source
  FOR EACH ROW EXECUTE FUNCTION wo_place_snapshot_part_guard();
DROP TRIGGER IF EXISTS wo_place_snapshot_profile_immutable ON wo_place_snapshot_profile;
CREATE TRIGGER wo_place_snapshot_profile_immutable BEFORE INSERT OR DELETE OR UPDATE ON wo_place_snapshot_profile
  FOR EACH ROW EXECUTE FUNCTION wo_place_snapshot_part_guard();
DROP TRIGGER IF EXISTS wo_place_snapshot_media_immutable ON wo_place_snapshot_media;
CREATE TRIGGER wo_place_snapshot_media_immutable BEFORE INSERT OR DELETE OR UPDATE ON wo_place_snapshot_media
  FOR EACH ROW EXECUTE FUNCTION wo_place_snapshot_part_guard();
DROP TRIGGER IF EXISTS wo_place_snapshot_import_immutable ON wo_place_snapshot_import;
CREATE TRIGGER wo_place_snapshot_import_immutable BEFORE INSERT OR DELETE OR UPDATE ON wo_place_snapshot_import
  FOR EACH ROW EXECUTE FUNCTION wo_place_snapshot_part_guard();
