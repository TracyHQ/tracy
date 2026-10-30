/**
 * The build runner's side of the rebuilding lock (`sites/site-lock.js`, spec TracyHQ/tracy#189): which sites a brief build
 * holds (and so will unlock once its final check is over), and the parts of the build receipt that say where the lock and
 * the fill stand:
 *   - `receipt.siteLock`: the lock as the build left it (`unlocked` once the site is full, `locked` after a failure);
 *   - `receipt.fill`: `{state: 'failed', code}` once the fill failed (the panel shows Failed with Retry, never Hand off),
 *     `{state: 'running'}` while a Retry fills it again, `{state: 'applied'}` once it is in.
 */
import { BRIEF_BUILD } from './brief-build-path.js'

/**
 * Whether a brief build (the one the runner judges and unlocks) holds this site. A site made from the Add site popup has
 * no such build, so its own Apply never locks it.
 *
 * 🔒 THE WORKFLOW IS READ FROM THE BUILD'S CHOICE, never from the revision's brief: since migration 165 a brief is
 * template-free and names no workflow (`build-choice.js`), so a reader of `wo_revision.brief` found no brief build on any
 * site and the rebuilding lock was never taken (R12, 30/10/2026).
 * @param {{query: Function}} pool @param {string} siteKey
 */
export async function briefBuildHoldsSite(pool, siteKey) {
  const { rows } = await pool.query(
    `select 1 from wo_build b
      where b.site_key = $1 and b.choice->>'quickstartWorkflow' = $2 and b.state <> 'deleted'
      limit 1`,
    [siteKey, BRIEF_BUILD]
  )
  return rows.length > 0
}

/**
 * Merge `part` into the build's receipt; the build as it stands afterwards.
 * @param {{query: Function}} db @param {any} build @param {Record<string, unknown>} part
 */
export async function saveReceiptPart(db, build, part) {
  try {
    const { rows } = await db.query(
      `update wo_build set receipt = coalesce(receipt, '{}'::jsonb) || $2::jsonb, updated_at = now()
       where id = $1 returning *`,
      [build.id, JSON.stringify(part)]
    )
    return rows[0] ?? { ...build, receipt: { ...build.receipt, ...part } }
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'DEMO_LEASE_LOST') throw error
    return { ...build, receipt: { ...build.receipt, ...part } }
  }
}

/**
 * The fill failed: the receipt says so, and the lock stays as the run left it (on).
 * @param {{query: Function}} db @param {any} build @param {string} code
 */
export const fillFailed = (db, build, code) => saveReceiptPart(db, build, { fill: { state: 'failed', code } })

/**
 * The build ended with a full site (its final check said clear or Needs fixes): take the rebuilding page off.
 * @param {{query: Function}} db
 * @param {{build: any, platform: string, email: string, unlock?: Function | null}} input
 */
export async function unlockFullSite(db, { build, platform, email, unlock }) {
  if (typeof unlock !== 'function' || build.receipt?.siteLock?.state === 'unlocked') return build
  const siteLock = await unlock({ siteKey: build.site_key, platform, email, runId: build.id }).catch(
    (/** @type {any} */ error) => ({ version: 1, state: 'locked', reason: String(error?.message ?? error) })
  )
  return siteLock ? saveReceiptPart(db, build, { siteLock }) : build
}
