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
 * 🔒 AND THE AI TURNS READ IT WITH A PREVIEW KEY. `tracy-site-tools` reads pages with the container's own curl and holds
 * no token. A plugin that lists "preview-key" in `info.site_offline.bypass_also` takes a fresh random key with the lock
 * (`offline_preview_key`, write-only on its side) and answers `X-Tracy-Preview-Key: <key>` with the real site. The key
 * lives in the lock state only (`previewKey`), so it dies at unlock; it is never logged and never in a receipt, a note
 * or a URL ({@link publicLock}). Site-tools asks it of `previewKey(siteKey)` through the conversation door. The plugin
 * stores only its SHA-256, refuses a key sent with `offline: 0`, clears it at unlock and lets it expire 6 hours after
 * it was set, so a lock held longer gets a fresh key ({@link PREVIEW_KEY_RENEW_MS}), sent again with `offline: 1`.
 *
 * The state lives on the site's brief row (`site_brief.timings.siteLock`), not in memory: the run that locks and the
 * runner that unlocks need not be the same process.
 */
import { randomBytes } from 'node:crypto'
import { CURRENT_BRIEF } from '../lib/site-brief-row.js'

export const SITE_LOCK_VERSION = 1

/** What a visitor reads on a locked site. English: no door names the site's language yet. Plain text, no dashes. */
/** The rebuilding page's title when the brief names no business. */
export const NEUTRAL_SITE_NAME = 'Website under construction'
export const REBUILDING_MESSAGE = 'This website is being updated. Please visit again shortly.'

/** The run's note when the site cannot be locked: the build goes on as before. */
export const LOCK_UNSUPPORTED_NOTE =
  'the site stayed open to visitors while it was rebuilt, because it cannot show a rebuilding page'

/** The shape of a preview key the plugin accepts (32 to 128 URL-safe characters). */
export const PREVIEW_KEY_SHAPE = /^[A-Za-z0-9_-]{32,128}$/

/** The plugin lets a preview key expire 6 hours after it is set: a key older than this is replaced first. */
export const PREVIEW_KEY_RENEW_MS = 5 * 60 * 60 * 1000

/** A fresh preview key: 36 random bytes, 48 URL-safe characters. */
const freshPreviewKey = () => randomBytes(36).toString('base64url')

/**
 * The lock as it may be shown or kept anywhere but the brief row: without its preview key.
 * @param {any} lock
 */
export function publicLock(lock) {
  if (!lock || typeof lock !== 'object') return lock
  const { previewKey: _secret, previewKeyAt: _at, ...shown } = lock
  return shown
}

/**
 * @typedef {object} SiteLockWriter one CMS's way of locking a site
 * @property {string} action - the door action that sets the lock fields
 * @property {(apply: Function, siteKey: string) => Promise<boolean | {previewKey?: boolean}>} supported - whether this
 *   site can be locked AND still be read by Tracy while it is; `{previewKey: true}` when it also takes a preview key
 * @property {(message: string, previewKey?: string | null) => Record<string, unknown>} lockFields
 * @property {() => Record<string, unknown>} unlockFields
 */

/**
 * @typedef {{version: number, state: 'locked' | 'unlocked' | 'unsupported' | 'failed', reason?: string,
 *   previewKey?: string, previewKeyAt?: number, platform?: string, runId?: string, source?: 'provision'}} SiteLockRecord
 *   (`previewKey` and when it was set: only on the brief row, only while locked; `platform` and `runId`: what a renewal
 *   writes with; `source`: taken by provisioning, before the door existed, `sourceLock`)
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
 * @param {{writer: SiteLockWriter | null | undefined, apply: Function, siteKey: string, applyId: string, message?: string,
 *   now?: () => number}} input
 * @returns {Promise<SiteLockRecord>}
 */
export async function lockSite({
  writer,
  apply,
  siteKey,
  applyId,
  message = REBUILDING_MESSAGE,
  now = Date.now
}) {
  if (!writer) return record('unsupported', 'no rebuilding page for this CMS')
  try {
    const offer = await writer.supported(apply, siteKey)
    if (!offer) return record('unsupported', 'the site plugin does not offer a rebuilding page')
    // A fresh key per lock, so a Retry never reuses the key of a lock that was taken off.
    const previewKey = typeof offer === 'object' && offer.previewKey === true ? freshPreviewKey() : null
    const answer = await apply({
      siteKey,
      action: writer.action,
      params: { operation: 'set', apply_id: applyId, fields: writer.lockFields(message, previewKey) }
    })
    if (answer?.ok === false) return record('failed', said(answer))
    return previewKey ? { ...record('locked'), previewKey, previewKeyAt: now() } : record('locked')
  } catch (error) {
    return record('failed', error instanceof Error ? error.message : String(error))
  }
}

/** The CMS whose provisioning can restore a site already locked (`offline_lock.py` writes Joomla's configuration.php). */
export const SOURCE_LOCK_PLATFORMS = new Set(['joomla'])

/**
 * The lock taken AT THE SOURCE (#189, criterion 12.1): a brief build's site is restored already on its rebuilding page,
 * so no visitor is served the raw demo between the CMS's first answer and the moment its door is paired. `host` goes in
 * the provision instruction (the key and the message, written into the restored files before the web server serves);
 * `record` is what the brief row keeps, so the build's readers send the key and the end of a full build unlocks it.
 * Null for a CMS whose provisioning cannot do it yet (the lock is then taken through the door, as before).
 * @param {{platform: string, now?: () => number, siteName?: string}} input
 * @returns {{host: {previewKey: string, message: string, siteName: string}, record: SiteLockRecord} | null}
 */
export function sourceLock({ platform, now = Date.now, siteName = '' }) {
  if (!SOURCE_LOCK_PLATFORMS.has(platform)) return null
  const previewKey = freshPreviewKey()
  // The rebuilding page's title is the site name: the business's when the brief names it, else a neutral one, never the
  // restored demo's own name.
  const name = String(siteName ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  return {
    host: { previewKey, message: REBUILDING_MESSAGE, siteName: name || NEUTRAL_SITE_NAME },
    record: { ...record('locked'), source: 'provision', previewKey, previewKeyAt: now(), platform }
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
 * @param {() => number} [deps.now]
 */
export function createSiteLock({ pool, writers, applyFor, holds, tokenOf, now = Date.now }) {
  const save = (/** @type {string} */ siteKey, /** @type {SiteLockRecord} */ lock) =>
    pool.query(
      `update site_brief set timings = timings || jsonb_build_object('siteLock', $2::jsonb), updated_at = now()
        where site_key = $1`,
      [siteKey, JSON.stringify(lock)]
    )
  /** @type {Map<string, Promise<string | null>>} one renewal per site at a time, so two asks never race two keys */
  const renewing = new Map()
  const track = (/** @type {string} */ siteKey, /** @type {Promise<string | null>} */ work) => {
    renewing.set(siteKey, work)
    return work.finally(() => renewing.delete(siteKey))
  }
  /** A fresh key for a lock held past the renewal age; null (no key) when it cannot be written. */
  const renew = async (
    /** @type {string} */ siteKey,
    /** @type {SiteLockRecord} */ held,
    /** @type {any} */ asker
  ) => {
    const writer = held.platform ? writers[held.platform] : undefined
    if (!writer || typeof asker !== 'string' || asker === '') return null
    const previewKey = freshPreviewKey()
    try {
      const answer = await applyFor(
        asker,
        held.runId ?? null
      )({
        siteKey,
        action: writer.action,
        params: {
          operation: 'set',
          apply_id: `site-lock-renew-${held.runId ?? 'run'}-${now()}`,
          fields: writer.lockFields(REBUILDING_MESSAGE, previewKey)
        }
      })
      if (answer?.ok === false) return null
    } catch {
      return null
    }
    await save(siteKey, { ...held, previewKey, previewKeyAt: now() })
    return previewKey
  }
  return {
    /**
     * Lock before the run's first write. Null when no judging build holds the site (the Add site popup's own Apply).
     * @param {{siteKey: string, platform: string, email: string, runId: string}} ctx
     * @returns {Promise<SiteLockRecord | null>}
     */
    async lock(ctx) {
      if (!(await holds(ctx.siteKey).catch(() => false))) return null
      const apply = applyFor(ctx.email, ctx.runId)
      const writer = writers[ctx.platform]
      const lock = await lockSite({
        writer,
        apply,
        siteKey: ctx.siteKey,
        applyId: `site-lock-${ctx.runId}`,
        now
      })
      if (lock.state === 'locked')
        return lock.previewKey ? { ...lock, platform: ctx.platform, runId: ctx.runId } : lock
      // 🔒 A SITE PROVISIONED LOCKED IS NEVER LEFT LOCKED WITH NOBODY TO LIFT IT. The door could not lock it again: a
      // refused or failed write keeps the source lock on the row (the end of a full build still unlocks it, and the
      // readers keep its key); a plugin that offers no lock has it lifted now, and the build runs open with its note.
      const held = await siteLockOf(pool, ctx.siteKey).catch(() => null)
      if (held?.state !== 'locked' || held.source !== 'provision') return lock
      if (lock.state === 'failed') return { ...held, runId: ctx.runId, reason: lock.reason }
      if (writer)
        await unlockSite({ writer, apply, siteKey: ctx.siteKey, applyId: `site-unlock-source-${ctx.runId}` })
      return lock
    },
    /**
     * Unlock a site the build left full. A site that was never locked is answered as its row says, and nothing is written.
     * @param {{siteKey: string, platform: string, email: string, runId: string}} input
     * @returns {Promise<SiteLockRecord | null>}
     */
    async unlock(input) {
      const now = await siteLockOf(pool, input.siteKey)
      if (now?.state !== 'locked') return publicLock(now)
      const lock = await unlockSite({
        writer: writers[input.platform],
        apply: applyFor(input.email, input.runId),
        siteKey: input.siteKey,
        applyId: `site-unlock-${input.runId}`
      })
      // A site still locked keeps its key on the row, so Tracy can still read it; the answer never carries it.
      const kept =
        lock.state === 'locked' && now.previewKey
          ? {
              ...lock,
              previewKey: now.previewKey,
              previewKeyAt: now.previewKeyAt,
              platform: now.platform,
              runId: now.runId
            }
          : lock
      await save(input.siteKey, kept)
      return publicLock(lock)
    },
    /**
     * The preview key a page read of the site sends while it is locked, else null. A key near the plugin's 6 hour
     * expiry is replaced first, written as `asker` (the seat holder who asked), with `offline: 1` again.
     * @param {string} siteKey @param {string | null} [asker]
     */
    async previewKey(siteKey, asker = null) {
      const held = await siteLockOf(pool, siteKey).catch(() => null)
      const key = held?.state === 'locked' ? held.previewKey : null
      if (typeof key !== 'string' || !PREVIEW_KEY_SHAPE.test(key)) return null
      if (now() - Number(held.previewKeyAt ?? 0) < PREVIEW_KEY_RENEW_MS) return key
      return renewing.get(siteKey) ?? track(siteKey, renew(siteKey, held, asker))
    },
    /** The bearer a read of the site sends while it is locked, else null. @param {string} siteKey */
    async bearer(siteKey) {
      const now = await siteLockOf(pool, siteKey).catch(() => null)
      return now?.state === 'locked' ? await tokenOf(siteKey).catch(() => null) : null
    }
  }
}
