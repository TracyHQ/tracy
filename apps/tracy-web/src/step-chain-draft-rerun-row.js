// The site brief row of a run on a site that is already built (#612): a revision of the plan, or the resume of one
// that stopped. The run frame (`sites/brief-build.js`) starts a run from a row in `queued`, and a first build's row is
// written by the create door (`putBrief`) and put back only from `failed` before its site is reinstalled
// (`restartBrief`). So a built site, whose row ended `applied`, had no way back to `queued`, and a row put back by
// `restartBrief` loses `provisionedAt`: the frame would then wait for a host install that never comes.
//
// This puts the row of a BUILT step chain site back to `queued` with the run's brief, once, in one statement (compare
// and set: of two asks at once exactly one gets the row), and keeps the site's up mark so the frame writes as soon as
// the run's words are ready. A row still going (`queued` .. `applying`) is left alone: one run per site at a time.
import { STEP_CHAIN_WORKFLOW } from './lib/step-chain-switch.js'

/**
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {object} brief the run's brief (`{workflow, draftId, plan, rebuildFrom, buildRun}`)
 * @returns {Promise<boolean>} whether the row was put back for this run
 */
export async function rerunBrief(pool, siteKey, brief) {
  const { rowCount } = await pool.query(
    `update site_brief b set state = 'queued', stage = null, error = null, normalized = null,
       timings = jsonb_build_object(
         'attemptStartedAt', floor(extract(epoch from clock_timestamp()) * 1000),
         'provisionedAt', coalesce(b.timings -> 'provisionedAt', b.timings -> 'readyAt',
           to_jsonb(floor(extract(epoch from clock_timestamp()) * 1000)))),
       brief = $2::jsonb, updated_at = now()
     where b.site_key = $1 and b.state in ('applied', 'failed')
       and b.brief ->> 'workflow' = $3
       and exists (select 1 from site s where s.site_key = b.site_key and b.created_at >= s.created_at)`,
    [siteKey, JSON.stringify(brief), STEP_CHAIN_WORKFLOW]
  )
  return rowCount === 1
}

/**
 * What the frame needs to run on the built site, from its brief row and its site row: the platform, the quickstart
 * and its version, the label and the account the site was built for. Null when the site has no current row.
 * @param {import('pg').Pool} pool @param {string} siteKey
 */
export async function builtSiteOf(pool, siteKey) {
  const { rows } = await pool.query(
    `select b.platform, b.quickstart, b.account_id, b.state, s.label, s.quickstart_version
       from site_brief b join site s on s.site_key = b.site_key
      where b.site_key = $1 and b.created_at >= s.created_at`,
    [siteKey]
  )
  return rows[0] ?? null
}
