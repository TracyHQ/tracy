/**
 * Website Opportunities demo marks that a site's own operations must write — kept in lib/ so the
 * sites domain can stamp a build without importing the opportunities domain (module-graph rule).
 */

/** A site deleted through its own door (`DELETE /api/sites/:key`), not by the retention sweep:
 * every build that pointed at it reads deleted from here on, and the build action still open on it ends
 * (`DEMO_SITE_DELETED`): an agent build stays open after its turn for the owner's follow-up, and that open action
 * refused every new build of the place (`DEMO_BUILD_ACTIVE`) with its site gone (local stand 24/10/2026). The
 * status change also loses a running lease (`demoLeasePool` reads `status`). Returns how many builds this stamped. */
export async function markDemoDeletedBySite(pool, siteKey, { now = Date.now() } = {}) {
  const at = new Date(now)
  const { rows } = await pool.query(
    `with stamped as (
       update wo_build set demo_deleted_at = $2, state = 'deleted', updated_at = now()
        where site_key = $1 and demo_deleted_at is null
        returning account_id, revision_id, request_id
     ), ended as (
       update wo_demo_action a
          set status = 'failed', error = 'DEMO_SITE_DELETED', checked_at = $2, updated_at = $2,
              lease_token = a.lease_token + 1, lease_until = null, next_at = null
         from stamped b
        where a.account_id = b.account_id and a.revision_id = b.revision_id and a.build_request_id = b.request_id
          and a.status in ('queued', 'quality-queued-v1')
        returning a.id
     )
     select (select count(*) from stamped)::int as builds`,
    [siteKey, at]
  )
  return rows[0]?.builds ?? 0
}
