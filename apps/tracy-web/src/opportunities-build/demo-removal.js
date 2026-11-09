/**
 * The builder's half of deleting a saved opportunity (`website-opportunities/src/opportunity-delete.js`): before the
 * row goes, its live demo sites are torn down and what would hold the row back is dropped.
 *
 *   live demo   a build of the opportunity with a site that is not deleted yet, and not a customer's own site
 *               (Build from my business, `own-site.js`: the customer's site, never a demo)
 *   teardown    the demo retention sweep's own path (`demo-retention.js` `deleteDemo` with the same `teardown`,
 *               the site delete door's operation acted as the account that built it, `app.js`). A teardown
 *               that started counts as removed: the host finishes it and closes the site's book
 *               (`closeDeletedSite`) whether or not the build row is still there. `busy` (another operation holds
 *               the site) refuses the delete, and the row stays
 *   links       `wo_quality_action_link` points at the opportunity's demo actions without a cascade; its rows go
 *               so the demo actions can. The quality runs themselves stay, like the cost ledger
 */
import { deleteDemo } from './demo-retention.js'

/**
 * A demo still being built, which a delete must wait for (409 `DEMO_BUILD_RUNNING`): its site could otherwise be
 * made after the row is gone and belong to nobody's list. Either a build whose provision has not ended
 * (`requesting`, `provisioning`: `build-store.js` `BUILD_OPEN`), or a demo action still queued whose build is not
 * done yet (its brief is being written, a Retry is under way on its build). An agent action left open after a done
 * build (the owner's follow-up chat) does not count: its site is up and is torn down like any other.
 */
const BUILD_RUNNING = `select 1 from wo_build b join wo_revision r on r.id = b.revision_id
   where r.opportunity_id = $1 and b.account_id = $2 and b.state in ('requesting', 'provisioning')
     and b.demo_deleted_at is null
 union all
 select 1 from wo_demo_action a
   where a.opportunity_id = $1 and a.account_id = $2 and a.status in ('queued', 'quality-queued-v1')
     and not exists (select 1 from wo_build b where b.account_id = a.account_id
       and b.request_id = a.build_request_id and b.state = 'done')
 limit 1`

/** Whether the opportunity has a demo still being built (see `BUILD_RUNNING`). */
export async function demoBuildRunning(pool, opp, accountId) {
  return (await pool.query(BUILD_RUNNING, [opp.id, accountId])).rowCount > 0
}

const LIVE_DEMOS = `select b.* from wo_build b join wo_revision r on r.id = b.revision_id
   where r.opportunity_id = $1 and b.account_id = $2 and b.site_key is not null
     and b.demo_deleted_at is null and b.state is distinct from 'deleted'
     and not exists (select 1 from wo_demo_action a where a.account_id = b.account_id
       and a.build_request_id = b.request_id and a.selection->>'ownSite' = 'true')
   order by b.created_at`

/**
 * @param {import('pg').Pool} pool
 * @param {{ id: string }} opp the account's opportunity
 * @param {string} accountId
 * @param {{ now: number, teardown: ((build: object) => Promise<'gone' | 'started' | 'busy'>) | null }} deps
 * @returns {Promise<{ ok: true, siteRemoved: boolean } | { ok: false, code: 'DEMO_TEARDOWN_FAILED' }>}
 */
export async function prepareOpportunityDelete(pool, opp, accountId, { now, teardown }) {
  const { rows } = await pool.query(LIVE_DEMOS, [opp.id, accountId])
  if (rows.length > 0 && typeof teardown !== 'function') return { ok: false, code: 'DEMO_TEARDOWN_FAILED' }
  let siteRemoved = false
  for (const build of rows) {
    const said = await deleteDemo(pool, build, { now, teardown })
    if (said === 'busy') return { ok: false, code: 'DEMO_TEARDOWN_FAILED' }
    siteRemoved = true
  }
  await pool.query('delete from wo_quality_action_link where opportunity_id = $1 and account_id = $2', [
    opp.id,
    accountId
  ])
  return { ok: true, siteRemoved }
}
