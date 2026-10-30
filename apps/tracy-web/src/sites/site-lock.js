/**
 * The rebuilding lock of a brief build (spec TracyHQ/tracy#189, COO decision of 30/10/2026): from the moment the build
 * starts writing into a site until it ends with a full site (its final check says clear or Needs fixes), a visitor of the
 * public site sees a "rebuilding" page instead of a half-written one. A build that ends in any failure leaves the lock on;
 * the person sees Failed with Retry, and the Retry locks it again before its own first write.
 *
 * CMS-NEUTRAL. This module decides WHEN and keeps the state; each CMS has a writer that says whether its site can be locked
 * and with which door fields (`brief-engines/site-lock-joomla.js`). A CMS without a writer, or a site whose plugin does not
 * advertise the lock, is built open as before, with a note on the run.
 *
 * 🔒 TRACY STILL READS THE REAL SITE WHILE IT IS LOCKED. Every reader of a build (the engines' `siteReader`, the final
 * check's page reader, the demo picture reader) asks `bearer(siteKey)`: while the lock is on, it sends the site's own
 * component token as `Authorization: Bearer`, which the plugin answers with the real site (`lockedRead`). Only to the
 * site's own address, never to a font host.
 *
 * The state lives on the site's brief row (`site_brief.timings.siteLock`), not in memory: the run that locks and the
 * runner that unlocks need not be the same process.
 */
import { CURRENT_BRIEF } from '../lib/site-brief-row.js'

export const SITE_LOCK_VERSION = 1

/** What a visitor reads on a locked site. English: no door names the site's language yet. Plain text, no dashes. */
export const REBUILDING_MESSAGE = 'This website is being updated. Please visit again shortly.'

/** The run's note when the site cannot be locked: the build goes on as before. */
export const LOCK_UNSUPPORTED_NOTE =
  'the site stayed open to visitors while it was rebuilt, because it cannot show a rebuilding page'

/**
 * @typedef {object} SiteLockWriter one CMS's way of locking a site
 * @property {string} action - the door action that sets the lock fields
 * @property {(apply: Function, siteKey: string) => Promise<boolean>} supported - whether this site can be locked AND
 *   still be read by Tracy while it is
 * @property {(message: string) => Record<string, unknown>} lockFields
 * @property {() => Record<string, unknown>} unlockFields
 */

/**
 * @typedef {{version: number, state: 'locked' | 'unlocked' | 'unsupported' | 'failed', reason?: string}} SiteLockRecord
 */

const record = (/** @type {SiteLockRecord['state']} */ state, /** @type {string} */ reason = '') => ({
  version: SITE_LOCK_VERSION,
  state,
  ...(reason ? { reason: reason.slice(0, 300) } : {})
})

const said = (/** @type {any} */ answer) =>
  String(answer?.message ?? answer?.error ?? answer?.code ?? 'refused').slice(0, 300)

/**
 * Put the site on its rebuilding page, before the build's first write.
 * @param {{writer: SiteLockWriter | null | undefined, apply: Function, siteKey: string, applyId: string, message?: string}} input
 * @returns {Promise<SiteLockRecord>}
 */
export async function lockSite({ writer, apply, siteKey, applyId, message = REBUILDING_MESSAGE }) {
  if (!writer) return record('unsupported', 'no rebuilding page for this CMS')
  try {
    if (!(await writer.supported(apply, siteKey)))
      return record('unsupported', 'the site plugin does not offer a rebuilding page')
    const answer = await apply({
      siteKey,
      action: writer.action,
      params: { operation: 'set', apply_id: applyId, fields: writer.lockFields(message) }
    })
    return answer?.ok === false ? record('failed', said(answer)) : record('locked')
  } catch (error) {
    return record('failed', error instanceof Error ? error.message : String(error))
  }
}

/**
 * Take the rebuilding page off: the build ended with a full site.
 * @param {{writer: SiteLockWriter | null | undefined, apply: Function, siteKey: string, applyId: string}} input
 * @returns {Promise<SiteLockRecord>}
 */
export async function unlockSite({ writer, apply, siteKey, applyId }) {
  if (!writer) return record('failed', 'no rebuilding page for this CMS')
  try {
    const answer = await apply({
      siteKey,
      action: writer.action,
      params: { operation: 'set', apply_id: applyId, fields: writer.unlockFields() }
    })
    return answer?.ok === false ? record('locked', said(answer)) : record('unlocked')
  } catch (error) {
    return record('locked', error instanceof Error ? error.message : String(error))
  }
}

/**
 * The headers of one read of a site: the lock's bearer added when the site is locked and the read goes to the site itself.
 * @param {Record<string, string>} headers
 * @param {string | null} bearer
 * @param {boolean} ownSite - the read goes to the site's own origin (never a font host)
 */
export function lockedRead(headers, bearer, ownSite) {
  if (!bearer || !ownSite) return headers
  return { ...headers, authorization: `Bearer ${bearer}` }
}

/** The lock as the site's brief row keeps it, or null. @param {{query: Function}} pool @param {string} siteKey */
export async function siteLockOf(pool, siteKey) {
  const { rows } = await pool.query(
    `select b.timings->'siteLock' as lock from site_brief b left join site s on s.site_key = b.site_key
      where b.site_key = $1 and ${CURRENT_BRIEF}`,
    [siteKey]
  )
  const lock = rows[0]?.lock
  return lock && typeof lock === 'object' ? /** @type {SiteLockRecord} */ (lock) : null
}

/**
 * The lock as one process runs it.
 * @param {object} deps
 * @param {{query: Function}} deps.pool
 * @param {Record<string, SiteLockWriter>} deps.writers - by platform
 * @param {(email: string, runId: string) => Function} deps.applyFor - the Apply door as a person
 * @param {(siteKey: string) => Promise<boolean>} deps.holds - whether a build that judges the finished site (and so
 *   unlocks it) holds this site; a site nobody will judge is never locked
 * @param {(siteKey: string) => Promise<string | null>} deps.tokenOf - the site's own component token
 */
export function createSiteLock({ pool, writers, applyFor, holds, tokenOf }) {
  const save = (/** @type {string} */ siteKey, /** @type {SiteLockRecord} */ lock) =>
    pool.query(
      `update site_brief set timings = timings || jsonb_build_object('siteLock', $2::jsonb), updated_at = now()
        where site_key = $1`,
      [siteKey, JSON.stringify(lock)]
    )
  return {
    /**
     * Lock before the run's first write. Null when no judging build holds the site (the Add site popup's own Apply).
     * @param {{siteKey: string, platform: string, email: string, runId: string}} ctx
     * @returns {Promise<SiteLockRecord | null>}
     */
    async lock(ctx) {
      if (!(await holds(ctx.siteKey).catch(() => false))) return null
      return lockSite({
        writer: writers[ctx.platform],
        apply: applyFor(ctx.email, ctx.runId),
        siteKey: ctx.siteKey,
        applyId: `site-lock-${ctx.runId}`
      })
    },
    /**
     * Unlock a site the build left full. A site that was never locked is answered as its row says, and nothing is written.
     * @param {{siteKey: string, platform: string, email: string, runId: string}} input
     * @returns {Promise<SiteLockRecord | null>}
     */
    async unlock(input) {
      const now = await siteLockOf(pool, input.siteKey)
      if (now?.state !== 'locked') return now
      const lock = await unlockSite({
        writer: writers[input.platform],
        apply: applyFor(input.email, input.runId),
        siteKey: input.siteKey,
        applyId: `site-unlock-${input.runId}`
      })
      await save(input.siteKey, lock)
      return lock
    },
    /** The bearer a read of the site sends while it is locked, else null. @param {string} siteKey */
    async bearer(siteKey) {
      const now = await siteLockOf(pool, siteKey).catch(() => null)
      return now?.state === 'locked' ? await tokenOf(siteKey).catch(() => null) : null
    }
  }
}
