-- READ-ONLY REPORT: site rows left behind by a create press that was refused 409 TAKEN.
--
-- Until 10/10/2026 `POST /api/sites` claimed the name (site row + owner seat) BEFORE it asked whether
-- the name was occupied, and counted any provision job ever filed under the name — a deleted site's
-- included, since jobs outlive their site. A press for a deleted name therefore answered TAKEN and
-- left a new row behind: shown in the owner's site list, with no job, no container, and a cms-log
-- pull failing every minute. Measured on dev 09/10/2026 (`e2e-em`).
--
-- Signature of such a row (every condition is needed):
--   * a customer site (`fleet_born`, not a demo, not stock in the inventory);
--   * no job filed since the row was written — older jobs belong to the deleted site;
--   * no `site_creation` row points at it (a refused press never recorded its site key; a draft
--     claim from `/api/sites/claim` does, and the claim sweep owns those).
-- It does NOT check the host: confirm there is no `<label>-*` container before acting on a row.
--
-- This file changes nothing and nothing runs it on deploy. Removing a row is a decision per row,
-- made by a person through the site's own delete (`DELETE /api/sites/:key`), never a migration.
--
--   sudo docker exec -i tracy-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X \
--     --set=default_transaction_read_only=on' < apps/tracy-web/scripts/report-refused-claim-orphans.sql
select
  s.site_key,
  s.label,
  s.created_at,
  (select string_agg(a.email || ':' || se.role, ', ')
     from seat se join account a on a.id = se.account_id
    where se.site_key = s.site_key and se.revoked_at is null) as seats,
  (select count(*) from job j where j.site_key = s.site_key) as jobs_of_earlier_sites,
  (select max(j.created_at) from job j where j.site_key = s.site_key) as last_earlier_job
from site s
where s.origin = 'fleet_born'
  and not s.demo
  and not exists (select 1 from inventory_instance i where i.site_key = s.site_key)
  and not exists (select 1 from job j where j.site_key = s.site_key and j.created_at >= s.created_at)
  and not exists (select 1 from site_creation c where c.site_key = s.site_key)
order by s.created_at desc;
