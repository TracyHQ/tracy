/**
 * A demo's other looks, for its share page (`opportunities-build/demo-link-route.js`, "See another look"): the same
 * demo previewed in a few other design systems, for the business owner the seller sent it to, WITHOUT anything written
 * to the demo.
 *
 * NO NEW PREVIEW MECHANISM. Each look is the Design system preview popup's live frame
 * (`lib/ds-preview-ticket.js`, `bar/ds-preview.js`, `design-system-live-page.js`): the demo's own page at its own
 * address with `?tracy_ds_preview=<ticket>`, which the site proxy answers with the very bytes an apply would write for
 * that system through the template's slot contract (the same emitter, `lib/ds-slot.js` `emitFor`), the worn slot taken
 * off first. So a look changes exactly what Try on would change, and nothing a slot does not reach: the template's
 * layout, photos, words and any colour the contract keeps (a photo band, brand art) stay as they are. The ticket is
 * signed here only after the same gates the running site's preview door (`design-system-site-reads.js` `liveFrame`)
 * applies, judged the same way: the template the demo runs and its contract (one read in its container, `survey`), the
 * customer lock (judged as a customer: the owner holds no seat), a platform with a slot, not an imported site, and a
 * demo this server's site proxy answers (a demo on another host is served by that host's tunnel, never through here,
 * so a ticket would show it wearing nothing while the page names a look: `liveServed` of the Add site door).
 *
 * WHICH SYSTEMS (`demoSystemChoice`): the featured systems of the library (`lib/ds-slot.js` `FEATURED_REFERO_SYSTEMS`,
 * "the systems measured on every published WordPress and Joomla template", the ones the panel lists first), in that
 * order, among those the library offers (the quality gate passed), without the one the demo already wears, the first
 * `DEMO_SYSTEMS_MAX` whose bytes the template's contract emits. Nothing is named here by hand. A template whose
 * contract emits none of them offers no look: the share page then shows the demo with no control.
 *
 * `eligible` is the cheap first answer the share link asks before it draws its page (no read in the container): the
 * release the demo was built from can wear a system (`supportForNewSite`, the Add site form's answer) and its template
 * is open to customers. `systemsOf` is the real answer (a read in the container, kept `SURVEY_KEEP_MS`).
 */
import { isImportedSite } from '../lib/design-system-imported-site.js'
import { mintDsPreviewTicket } from '../lib/ds-preview-ticket.js'
import { FEATURED_REFERO_SYSTEMS } from '../lib/ds-slot.js'
import { slotOf, themeFoldersFor } from './design-system-preview-page.js'

/** Looks offered besides the demo as it was built. */
export const DEMO_SYSTEMS_MAX = 4
/** How long one read of a demo in its container is trusted: what it wears changes only when someone applies a system. */
export const SURVEY_KEEP_MS = 2 * 60_000
/** How long whether a contract emits a system is trusted: a library and its contracts change only on a deploy. */
export const EMIT_KEEP_MS = 10 * 60_000
/** Demos and emits kept at most (the oldest goes first). */
const KEPT_MAX = 256

/**
 * The systems a demo's share page may offer, in the order it offers them: the featured systems the library offers
 * (its rows with `ok`), in `featured` order, without `worn`. PURE.
 * @template {{ id: string, uuid: string, ok?: boolean }} R
 * @param {R[]} offered the library as the doors offer it (`referoLibrary`)
 * @param {{ worn?: string | null, featured?: readonly string[] }} [q] `worn`: the library id the demo wears now
 * @returns {R[]}
 */
export function demoSystemChoice(offered, { worn = null, featured = FEATURED_REFERO_SYSTEMS } = {}) {
  const byUuid = new Map((offered ?? []).filter((s) => s?.ok === true).map((s) => [s.uuid, s]))
  const out = []
  const taken = new Set()
  for (const uuid of featured) {
    const row = byUuid.get(uuid)
    if (!row || taken.has(uuid) || row.id === worn) continue
    taken.add(uuid)
    out.push(row)
  }
  return out
}

/** A map kept to `max` entries, the oldest going first. */
function keep(map, key, value, max = KEPT_MAX) {
  map.delete(key)
  map.set(key, value)
  while (map.size > max) map.delete(map.keys().next().value)
}

/**
 * @param {{
 *   siteByKey: (key: string) => Promise<any>,
 *   ds: {
 *     quickstartTemplateOf?: (q: { platform: string, tag: string | null }) => string | null,
 *     supportForNewSite?: (q: { platform: string, tag: string, version: string | null }) => { supported: boolean },
 *     emitFor: (q: any) => Promise<any>,
 *     fontFaces?: (href: string | null) => Promise<any[]>
 *   },
 *   offered: () => Promise<any[]>,
 *   survey: (site: any) => Promise<{ failed: string } | { read: any, templateKey: string | null, fit: any }>,
 *   lockedFor: (email: string | null, templateKey: string | null) => Promise<boolean>,
 *   publicOf: (site: any) => string | null,
 *   secret?: string | null,
 *   servedHere: (site: any) => boolean,
 *   platforms: Set<string>,
 *   now?: () => number
 * }} deps `publicOf`: the address the site is served at (where the frame asks); `secret`: what signs a ticket
 *   (`config.sessionSecret`), none: no look is offered; `servedHere`: whether this server's site proxy answers it.
 */
export function designSystemDemoSystems({
  siteByKey,
  ds,
  offered,
  survey,
  lockedFor,
  publicOf,
  secret = null,
  servedHere,
  platforms,
  now = Date.now
}) {
  /** @type {Map<string, { at: number, said: any }>} */
  const surveys = new Map()
  /** @type {Map<string, { at: number, ok: boolean }>} */
  const emits = new Map()

  async function surveyOf(site) {
    const kept = surveys.get(site.site_key)
    if (kept && now() - kept.at < SURVEY_KEEP_MS) return kept.said
    const said = await survey(site)
    // A read that failed is asked again next time.
    if (!said?.failed) keep(surveys, site.site_key, { at: now(), said })
    return said
  }

  /** Whether the contract emits the system's bytes (an apply could write it), asked once a while. */
  async function emitsFor(platform, contract, id) {
    const key = `${platform}\n${contract}\n${id}`
    const kept = emits.get(key)
    if (kept && now() - kept.at < EMIT_KEEP_MS) return kept.ok
    let ok = false
    try {
      const out = await ds.emitFor({ platform, contract, id, fontFaces: ds.fontFaces })
      ok = Boolean(out?.ok) && slotOf(out) !== null
    } catch {
      ok = false
    }
    keep(emits, key, { at: now(), ok })
    return ok
  }

  /** The gates that need no read in the container; null when they pass, else the reason. */
  function plainRefusal(site) {
    if (!site) return 'NO_SITE'
    if (!secret) return 'NOT_WIRED'
    if (!platforms.has(String(site.platform))) return 'PLATFORM'
    if (isImportedSite(site)) return 'IMPORTED'
    if (!servedHere(site)) return 'NOT_SERVED_HERE'
    try {
      const pub = new URL(String(publicOf(site)))
      if (pub.protocol !== 'http:' && pub.protocol !== 'https:') return 'NO_ADDRESS'
    } catch {
      return 'NO_ADDRESS'
    }
    return null
  }

  /**
   * Whether the demo's share page may offer other looks, without a read in its container: the release it was built
   * from can wear a system and its template is open to customers. False on any doubt.
   * @param {string} siteKey
   * @returns {Promise<boolean>}
   */
  async function eligible(siteKey) {
    try {
      const site = await siteByKey(siteKey)
      if (plainRefusal(site) !== null) return false
      const tag =
        typeof site.quickstart_tag === 'string' && site.quickstart_tag !== '' ? site.quickstart_tag : null
      if (!tag || !ds.quickstartTemplateOf || !ds.supportForNewSite) return false
      const templateKey = ds.quickstartTemplateOf({ platform: site.platform, tag })
      if (!templateKey) return false
      const support = ds.supportForNewSite({
        platform: site.platform,
        tag,
        version: site.quickstart_version ?? null
      })
      if (support?.supported !== true) return false
      return !(await lockedFor(null, templateKey))
    } catch {
      return false
    }
  }

  /**
   * The looks the demo's share page offers: `{ok: true, siteKey, origin, systems}`, each system
   * `{id, n, name, colors, ticket}` (`n`: the number the page shows it under, from 1), or `{ok: false, reason}`.
   * @param {string} siteKey
   */
  async function systemsOf(siteKey) {
    const site = await siteByKey(siteKey)
    const refused = plainRefusal(site)
    if (refused) return { ok: false, reason: refused }
    const said = await surveyOf(site)
    if (!said || said.failed) return { ok: false, reason: 'SITE_UNREADABLE' }
    const { templateKey, fit } = said
    if (!fit || !('contract' in fit)) return { ok: false, reason: 'NO_SLOT' }
    // WordPress: the proxy dresses only a page served by the judged template's theme folders.
    if (site.platform === 'wordpress' && themeFoldersFor(templateKey).length === 0)
      return { ok: false, reason: 'NO_SLOT' }
    if (await lockedFor(null, templateKey)) return { ok: false, reason: 'TEMPLATE_LOCKED' }
    const worn = typeof said.read?.slot?.id === 'string' ? said.read.slot.id : null
    const systems = []
    for (const s of demoSystemChoice(await offered(), { worn })) {
      if (systems.length === DEMO_SYSTEMS_MAX) break
      if (!(await emitsFor(site.platform, fit.contract, s.id))) continue
      systems.push({
        id: s.id,
        n: systems.length + 1,
        name: s.name,
        // The system's own palette (`lib/ds-slot.js` `paletteOf`), drawn as swatches beside the look's number.
        colors: Array.isArray(s.colors)
          ? s.colors.filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 5)
          : [],
        ticket: mintDsPreviewTicket(
          /** @type {string} */ (secret),
          { site: site.site_key, id: s.id, contract: String(fit.contract), template: templateKey ?? '' },
          now()
        )
      })
    }
    if (systems.length === 0) return { ok: false, reason: 'NO_SYSTEM' }
    return {
      ok: true,
      siteKey: site.site_key,
      origin: new URL(String(publicOf(site))).origin,
      systems
    }
  }

  return { eligible, systemsOf }
}
