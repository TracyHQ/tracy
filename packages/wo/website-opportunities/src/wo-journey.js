/** Shared customer milestones for My Opportunities and the admitted operator view. */
const RESEARCH_ONLY = { joins: '', outreach: 'false', demo: 'false', attention: 'false' }

/**
 * A row's `stage` (Research → Demo → Outreach, or Cancelled) and `attention` as SQL over `o`
 * (wo_opportunity), with the joins they read: `lj` (latest job), `jr` (completed research), plus the
 * demo builder's own (`demoJourney`, e.g. `opportunities-build/journey-sql.js`). Without a builder
 * nothing is ever built, so the stage comes from research alone.
 * Callers must explicitly choose a bound account placeholder or the admitted all-account scope.
 * @param {{accountSql?: string, allAccounts?: true}} scope
 * @param {((where: (alias: string) => string) =>
 *   {joins: string, outreach: string, demo: string, attention: string}) | null} [demoJourney]
 * @returns {{joins: string, stage: string, attention: string}}
 */
export function journeySql(scope, demoJourney = null) {
  const account = scope?.accountSql
  if (scope?.allAccounts !== true && !/^\$[1-9]\d*$/.test(account ?? ''))
    throw new TypeError('A journey query requires an explicit account scope')
  if (scope.allAccounts === true && account)
    throw new TypeError('A journey query cannot combine account scopes')
  const where = (alias) => (scope.allAccounts === true ? 'true' : `${alias}.account_id = ${account}`)
  const demo = demoJourney ? demoJourney(where) : RESEARCH_ONLY
  return {
    joins: `
  left join (select distinct on (j.opportunity_id) j.opportunity_id, j.id, j.state from wo_job j
             where ${where('j')} order by j.opportunity_id, j.created_at desc, j.id desc) lj
    on lj.opportunity_id = o.id
  left join (select distinct j.opportunity_id from wo_job j
             where ${where('j')} and j.kind = 'research' and j.state = 'completed') jr
    on jr.opportunity_id = o.id${demo.joins}`,
    stage: `case
    when ${demo.outreach} then 'outreach'
    when jr.opportunity_id is not null or ${demo.demo} then 'demo'
    when lj.state = 'cancelled' then 'cancelled'
    else 'research' end`,
    attention: `(coalesce(lj.state in ('failed', 'paused', 'blocked'), false) or ${demo.attention})`
  }
}

/** `wo_demo_action.status` of the quality protocol (migration 151), read as the legacy state it stands for. */
const ACTION_STATE = {
  'quality-queued-v1': 'queued',
  'quality-failed-v1': 'failed',
  'quality-completed-v1': 'completed'
}

/**
 * Operator labels matching the customer statusView contract; operational detail stays separate. `actionState` may be
 * the raw `wo_demo_action.status`. A latest action that has not completed keeps the row in Demo, as the client's
 * `stageOf` and the demo builder's `outreach` SQL do (27/10/2026).
 */
export function customerStatus({ stage: journeyStage, jobState, actionState: rawAction, build }) {
  const actionState = ACTION_STATE[rawAction] ?? rawAction
  const stage =
    journeyStage === 'outreach' && actionState && actionState !== 'completed' ? 'demo' : journeyStage
  if (stage === 'outreach') return { key: 'v3.demoReady', label: 'Demo ready' }
  if (stage === 'demo') {
    if (
      actionState === 'failed' ||
      ['failed', 'refused'].includes(build?.state) ||
      build?.qa === 'failed' ||
      (build?.done === true && !build.qa && actionState !== 'queued')
    )
      return { key: 'v3.needsReview', label: 'Needs review' }
    if (actionState === 'queued' || build) return { key: 'v3.building', label: 'Building…' }
    return { key: 'v3.readyToBuild', label: 'Ready to build' }
  }
  if (stage === 'cancelled') return { key: 'status.cancelled', label: 'Cancelled' }
  if (jobState === 'failed') return { key: 'status.failed', label: 'Failed' }
  if (jobState === 'paused' || jobState === 'blocked') return { key: 'status.paused', label: 'Paused' }
  return jobState
    ? { key: 'status.researching', label: 'Researching' }
    : { key: 'v3.notStarted', label: 'Not started' }
}
