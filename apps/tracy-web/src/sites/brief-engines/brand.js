/**
 * "Set the site's brand": the customer's name, logo and favicon written into a freshly built site, one step of Apply
 * (plan `tasks/plan-ten-logo-favicon.md`, D1, D2, §2).
 *
 *   setSiteBrand     THE seam: one site, one pack, one apply id → `{ written, skipped }`. The writers behind it
 *                    (`brand-wordpress.js`, `brand-joomla.js`, later EmDash) are its adapters; frame padding, which
 *                    logo variant goes where and which template takes what are decided inside, never by the caller.
 *   createSiteBrand  the step as the Apply runner calls it (`brief-build.js`): reads the uploaded files of THIS site,
 *                    finds the release version, and runs the seam through the recorded Apply door.
 *
 * 🔒 ONE APPLY ID FOR THE WHOLE STEP (`brand-<ts>`), so `apply.revert` takes every brand write back at once, and the
 * runner keeps it on the row with the other ids of the Apply (`recordedDoor`).
 * 🔒 SOFT. A refused write is a `skipped` entry with its reason and a note; the other writes still run, and nothing
 * here fails the build.
 * 🔒 ONE WRITE AT A TIME. A site takes one writer at a time (`pictures.js`, `writer_busy`): every write waits for the
 * one before it, and a busy site is asked again a few times before the write is given up.
 */
import { templateProfileOf } from '../../lib/template-profiles.js'
import { prepareBrand } from './brand-images.js'
import { writeJoomlaShare, writeWordpressShare } from './brand-share.js'
import { shareCardOf } from './brand-share-card.js'
import { nameAnswered, recordedDoor } from './shared.js'
import { writeEmdashBrand } from './brand-emdash.js'
import { writeJoomlaBrand } from './brand-joomla.js'
import { writeWordpressBrand } from './brand-wordpress.js'

export { monogramOf } from './brand-wordpress.js'

/** The writers, by platform. A platform without one says so for each picture it was given. */
const WRITERS = Object.freeze({
  wordpress: writeWordpressBrand,
  joomla: writeJoomlaBrand,
  emdash: writeEmdashBrand
})
/** The share-picture writers, run after the brand writer (EmDash's tool writes the card with the other pictures). */
const SHARE_WRITERS = Object.freeze({ wordpress: writeWordpressShare, joomla: writeJoomlaShare })

/** The CMS names as the customer reads them. */
const CMS_NAMES = Object.freeze({ wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' })
/** "an EmDash site", "a Joomla site". */
const siteOf = (/** @type {string} */ platform) => {
  const name = CMS_NAMES[platform] ?? platform
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} site`
}

/** How many times a busy site is asked again, and how long between two asks. */
const BUSY_TRIES = 4
const BUSY_WAIT_MS = 750

/**
 * @typedef {object} BrandPack
 * @property {string} [name]
 * @property {boolean} [nameGiven] - false when the name is not the customer's own but stands in for one (made from the site
 *   address): it is still written as the site name, but the template's page titles are left as they are
 * @property {{light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array}} [logo]
 * @property {Uint8Array} [favicon]
 * @property {boolean} [textLogo] - a brief build with no logo of the business: every logo spot of the design shows its name as
 *   text instead of the template's own logo (site plan `logo.decision` `name-as-text`, #193)
 */

/**
 * @typedef {object} BrandWriterInput what a writer is handed; it reports through `wrote` and `skip`
 * @property {string} siteKey - the site; a writer with no Apply door of its own (EmDash) reaches it by this
 * @property {Awaited<ReturnType<typeof prepareBrand>> & {share?: Buffer, nameGiven?: boolean, textLogo?: boolean}} prepared - the pack, logos
 *   padded into the profile's frame, and the share card made from the logo as uploaded (`brand-share-card.js`)
 * @property {any} profile - `templateProfileOf`, or null for a release with no row
 * @property {string | null} tag - the release tag
 * @property {string} applyId
 * @property {string} stamp - unique to this step, for file names
 * @property {(action: string, params: Record<string, unknown>) => Promise<any>} write - carries the apply id; a refusal throws
 * @property {(action: string, params: Record<string, unknown>) => Promise<any>} read - no apply id; answers as the door does
 * @property {(where: string) => void} wrote
 * @property {(where: string, reason: string) => void} skip
 */

/** A refusal's words: its code, then what it said. */
const refusalOf = (/** @type {any} */ answer) =>
  [answer?.error ?? answer?.code, answer?.message].filter(Boolean).join(': ') || 'no answer'

/**
 * Write one site's brand.
 * @param {object} input
 * @param {string} input.platform
 * @param {string} input.siteKey
 * @param {{tag: string | null, version: string | null} | null} input.release
 * @param {BrandPack} input.pack
 * @param {(call: {siteKey: string, action: string, params: Record<string, unknown>}) => Promise<any>} input.call - the Apply door
 * @param {string} input.applyId
 * @param {(note: string) => void} input.note
 * @param {(ms: number) => Promise<void>} [input.sleep]
 * @returns {Promise<{written: string[], skipped: Array<{where: string, reason: string}>}>}
 */
export async function setSiteBrand({
  platform,
  siteKey,
  release,
  pack,
  call,
  applyId,
  note,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  /** @type {string[]} */
  const written = []
  /** @type {Array<{where: string, reason: string}>} */
  const skipped = []
  const wrote = (/** @type {string} */ where) => void written.push(where)
  const skip = (/** @type {string} */ where, /** @type {string} */ reason) => {
    skipped.push({ where, reason })
    note(`${where}: ${reason}`)
  }
  const writer = WRITERS[platform]
  if (!writer) {
    if (pack.logo && Object.keys(pack.logo).length)
      skip('logo', `${siteOf(platform)} does not take a logo from Tracy yet`)
    if (pack.favicon) skip('favicon', `${siteOf(platform)} does not take a favicon from Tracy yet`)
    return { written, skipped }
  }
  const profile = release?.tag && release.version ? templateProfileOf(release.tag, release.version) : null
  const prepared = /** @type {BrandWriterInput["prepared"]} */ (await prepareBrand(pack, profile))
  prepared.requireComplete = pack.requireComplete === true
  prepared.textLogo = pack.textLogo === true && !Object.keys(pack.logo ?? {}).length
  if (
    prepared.requireComplete &&
    pack.logo &&
    !pack.logo.single &&
    !pack.logo.light &&
    profile?.logos !== 'dark'
  )
    skip('logo', 'the main logo has no source asset')
  if (typeof pack.nameGiven === 'boolean') prepared.nameGiven = pack.nameGiven
  // The share card is made from the logo as uploaded, not as fitted to a header spot (D5).
  const share = await shareCardOf(pack.logo)
  if (share) prepared.share = share
  const read = (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) =>
    call({ siteKey, action, params })
  const write = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
    for (let attempt = 1; ; attempt += 1) {
      const answer = await call({ siteKey, action, params: { apply_id: applyId, ...params } })
      if (answer?.ok !== false) return answer
      if (answer.error === 'writer_busy' && attempt < BUSY_TRIES) {
        await sleep(BUSY_WAIT_MS * attempt)
        continue
      }
      const error = new Error(refusalOf(answer))
      Object.assign(error, { answer })
      throw error
    }
  }
  /** @type {BrandWriterInput} */
  const input = {
    siteKey,
    prepared,
    profile,
    tag: release?.tag ?? null,
    applyId,
    stamp: applyId.replace(/[^\w-]/g, ''),
    write,
    read,
    wrote,
    skip
  }
  await writer(input)
  await SHARE_WRITERS[platform]?.(input)
  return { written, skipped }
}

/**
 * The brand step as the Apply runner calls it.
 * @param {object} deps
 * @param {(email: string, setupRun?: string) => (call: any) => Promise<any>} deps.applyFor - the Apply door as a person
 * @param {(id: string) => Promise<{bytes: Uint8Array, role: string, siteKey: string | null} | null>} deps.readFile - an upload by id
 * @param {(siteKey: string) => Promise<string | null>} deps.versionOf - the quickstart version the site was built from
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {(ctx: any) => Promise<any>} [deps.sitePlanFor] - the brief build's site plan, when there is one
 */
export function createSiteBrand({ applyFor, readFile, versionOf, sleep, sitePlanFor }) {
  /**
   * @param {{siteKey: string, platform: string, quickstart: string | null, email: string, runId?: string, brief: any, normalized: any,
   *   applied?: (id: string, how?: {reused: boolean}) => void, note: (note: string) => void}} ctx
   * @param {{applyId: string}} step
   */
  return async (ctx, { applyId }) => {
    const brand = ctx.brief?.brand ?? {}
    const unreadable = []
    for (const line of Array.isArray(ctx.brief?.brandNotes) ? ctx.brief.brandNotes : [])
      ctx.note(String(line))
    /** The bytes of an upload claimed for THIS site, or undefined (with a note) for anything else. */
    const bytesOf = async (/** @type {unknown} */ id, /** @type {string} */ what) => {
      if (id == null || id === '') return undefined
      if (typeof id !== 'string') {
        unreadable.push({ where: what, reason: 'invalid brand upload identifier' })
        return undefined
      }
      const file = await readFile(id).catch(() => null)
      if (
        !file ||
        file.siteKey !== ctx.siteKey ||
        !(file.bytes instanceof Uint8Array) ||
        !file.bytes.byteLength
      ) {
        unreadable.push({ where: what, reason: 'brand upload unavailable or belongs to another site' })
        ctx.note(`the ${what} could not be read, so the site keeps the template’s own`)
        return undefined
      }
      return file.bytes
    }
    /** @type {BrandPack} */
    const pack = { requireComplete: ctx.requireCompleteBrand === true }
    // Only a name the customer gave becomes the site's: one made from the site address, or the template's own standing in
    // for it, is no answer, so the site keeps the template's name, page titles and monogram as released (`nameAnswered`).
    if (
      nameAnswered(ctx.normalized) &&
      typeof ctx.normalized?.name === 'string' &&
      ctx.normalized.name.trim() !== ''
    ) {
      pack.name = ctx.normalized.name.trim()
      pack.nameGiven = true
    }
    const logo = {}
    for (const variant of /** @type {const} */ (['light', 'dark', 'single'])) {
      const bytes = await bytesOf(brand.logo?.[variant], 'logo')
      if (bytes) logo[variant] = bytes
    }
    // No logo given (or one that could not be read) is no answer: the site keeps the template's logo exactly as
    // released (LOGO-4 dropped, 09/10/2026). A brief written before that may still say `logoAsked`; it is not read.
    if (Object.keys(logo).length) pack.logo = logo
    // A brief build with no logo shows the business name as text, never the demo's logo (site plan, #193).
    if (
      !pack.logo &&
      pack.name &&
      (await sitePlanFor?.(ctx).catch(() => null))?.logo?.decision === 'name-as-text'
    )
      pack.textLogo = true
    const favicon = await bytesOf(brand.favicon, 'favicon')
    if (favicon) pack.favicon = favicon
    const version = ctx.quickstart ? await versionOf(ctx.siteKey).catch(() => null) : null
    const result = await setSiteBrand({
      platform: ctx.platform,
      siteKey: ctx.siteKey,
      release: ctx.quickstart ? { tag: ctx.quickstart, version } : null,
      pack,
      call: async (call) => {
        await ctx.assertBrandAllowed?.()
        return recordedDoor(ctx, applyFor(ctx.email, ctx.runId))(call)
      },
      applyId,
      note: ctx.note,
      ...(sleep ? { sleep } : {})
    })
    return { ...result, skipped: [...unreadable, ...result.skipped] }
  }
}
