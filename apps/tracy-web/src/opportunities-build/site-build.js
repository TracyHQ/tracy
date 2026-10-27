/**
 * The Website Opportunities build behind a site, as the brief engines' readers see it (`site-pictures.js`,
 * `site-content.js`).
 *
 * 🔒 THE PRESSER'S ACCOUNT, BY ID. The email the engine holds must name exactly one account, and that account must be the
 * one that made the site AND the build. A site made from the Add site form has no `wo_build` behind its build id: null.
 */
import { withBuildChoice } from './build-choice.js'

/**
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string} email
 * @returns {Promise<any | null>} the build row with its revision's id, opportunity, manifest, brief and frozen place
 *   profile
 */
export async function siteBuildOf(pool, siteKey, email) {
  const { rows: made } = await pool.query(
    'select account_id, build_id from site_creation where site_key = $1',
    [siteKey]
  )
  if (made.length !== 1) return null
  const { rows: accounts } = await pool.query('select id from account where lower(email) = lower($1)', [
    String(email ?? '')
  ])
  if (accounts.length !== 1 || accounts[0].id !== made[0].account_id) return null
  const { rows } = await pool.query(
    `select b.id, b.request_id, b.account_id, b.pictures, b.receipt, b.content, b.choice, r.id as revision_id,
       r.opportunity_id, r.asset_manifest, r.brief, r.profile_effective, r.place_snapshot_id,
       r.place_profile, r.research
     from wo_build b join wo_revision r on r.id = b.revision_id
     where b.account_id = $1 and b.build_id::text = $2 and r.account_id = $1`,
    [accounts[0].id, String(made[0].build_id)]
  )
  // The brief names no template: this build's choice is laid over it (`build-choice.js`).
  return rows[0] ? withBuildChoice(rows[0], rows[0].choice) : null
}
