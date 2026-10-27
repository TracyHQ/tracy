/**
 * The demo half of an opportunity's journey stage (`website-opportunities/src/wo-journey.js`), as SQL the open layer splices
 * into its own query: stage is filtered, counted and paged in SQL, so build facts cannot arrive later.
 * Adds `rv` (has a revision), `dm` (latest build) and `da` (latest demo action), in `o`'s scope.
 * @param {(alias: string) => string} where the account predicate of a table alias
 * @returns {{joins: string, outreach: string, demo: string, attention: string}} SQL fragments
 */
export function demoJourneySql(where) {
  return {
    joins: `
  left join (select distinct r.opportunity_id from wo_revision r where ${where('r')}) rv
    on rv.opportunity_id = o.id
  left join (select distinct on (r.opportunity_id) r.opportunity_id, b.id, b.account_id, b.build_id,
                  b.qa, b.state, b.demo_deleted_at
               from wo_revision r join wo_build b on b.revision_id = r.id
             where ${where('r')} order by r.opportunity_id, b.created_at desc, b.id desc) dm
    on dm.opportunity_id = o.id
  left join (select distinct on (a.opportunity_id) a.opportunity_id, a.id, a.status from wo_demo_action a
             where ${where('a')} order by a.opportunity_id, a.accepted_at desc, a.id desc) da
    on da.opportunity_id = o.id`,
    // Only a finished latest action (or none) lets the row reach Outreach: a Retry still queued, or a failed one,
    // keeps it in Demo whatever an older check of the reused build passed (27/10/2026). `wo_demo_action.status`
    // is `queued|completed|failed` or its `quality-*-v1` twin (migration 151); the client's `demoActionOpen` agrees.
    outreach: `dm.qa->>'state' = 'passed' and dm.state <> 'deleted' and dm.demo_deleted_at is null
  and (da.id is null or da.status in ('completed', 'quality-completed-v1'))`,
    demo: 'rv.opportunity_id is not null or da.id is not null',
    attention: `coalesce(dm.state in ('failed','refused'), false)
  or coalesce(da.status in ('failed', 'quality-failed-v1'), false)
  or coalesce(dm.qa->>'state' = 'failed', false)`
  }
}
