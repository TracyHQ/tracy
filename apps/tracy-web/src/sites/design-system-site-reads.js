/**
 * The Design system doors that read a site and write nothing (`design-system.js`), for any live grant
 * (a Viewer too, like reading the panel):
 *
 * - GET  /api/sites/:key/design-system/words   the site's own words for the panel's cards and preview
 *        (name, menu, eyebrow, first heading, its lead, the first two calls to action), read off the
 *        home page the site serves now — the same one read `seen` takes, through `wordsOf` (the public
 *        Design page's reader). `{present: false}` when the page could not be read or says nothing; the
 *        panel then draws each system's own sample text and says so. Kept `WORDS_TTL_MS` per site, so
 *        reopening the panel reads nothing again. Asked beside the panel's GET, never before it: the
 *        panel opens on the read and the words land on the cards when they come.
 *
 * - GET  /api/sites/:key/design-system/preview?id=<library id>&template=<key>?   the home page the site
 *        serves now, wearing system `id`, for the preview popup of a card (12/10/2026). NOTHING
 *        IS WRITTEN: the page is read on the site's own web container (`siteTarget`, never an address the
 *        client sent), the slot the site wears is taken off and the exact bytes an apply would write for
 *        this site's contract are laid in (`design-system-preview-page.js` `wornPageOf`, shared with the Add
 *        site door; WordPress: its global styles block as WordPress prints it with the variation merged
 *        in). `template`: the template the GET answered, judged as the apply judges it; none → one read
 *        in the container. Sandboxed HTML. `409 DS_PREVIEW_UNAVAILABLE` `{reason: PLATFORM | NO_SLOT}`
 *        (a CMS with no slot; a template that cannot wear one), `502 DS_PREVIEW_FAILED` when the page
 *        could not be read. Kept `SITE_PREVIEW_KEEP_MS` per (site, release, newest apply, system); every
 *        apply and undo of the site through the doors forgets the site's pages (`forgetPreviews`).
 *        `&path=<same-site path>`: another page of the site, asked by a link of a served preview inside the
 *        popup's frame (12/10/2026, option B): every same-site link of a served page points back here
 *        with its own `path` (`design-system-preview-links.js`), a link elsewhere opens a new tab. The host
 *        is always the site's; with `path` every refusal is a small `text/html` page with the same status,
 *        and a page the site has not got is `404 DS_PREVIEW_FAILED` `PAGE_NOT_FOUND` or `409
 *        DS_PREVIEW_UNAVAILABLE` `NOT_A_PAGE` / `LEAVES_SITE`. Kept per page too.
 *        `id=template-default` ({@link TEMPLATE_DEFAULT_ID}): the Template default card's popup (14/10/2026), the
 *        same page with the worn slot taken off and nothing laid in, so it shows the template's own look. On
 *        WordPress a worn system is merged into the global styles block and cannot be taken off faithfully, so
 *        a site wearing one answers `409 DS_PREVIEW_UNAVAILABLE` `NO_BARE`; one wearing nothing, its page.
 *        A template the customer lock closes (`lib/design-system-customer-lock.js`) answers a customer `403
 *        DS_TEMPLATE_LOCKED` for every system; the Template default card's popup still shows its page.
 *        An imported site (`lib/design-system-imported-site.js`) answers anyone `403 DS_IMPORTED_SITE` the same way.
 */
import { DS_TEMPLATE_LOCKED } from '../lib/design-system-customer-lock.js'
import { DS_PREVIEW_PARAM, mintDsPreviewTicket } from '../lib/ds-preview-ticket.js'
import { DS_IMPORTED_SITE, isImportedSite } from '../lib/design-system-imported-site.js'
import { wordsOf } from '../lib/home-page-words.js'
import { lastOf, libraryIdOf, TEMPLATE_DEFAULT_ID } from './design-system-ids.js'
import { previewRateLimited, previewRateLimiter, previewShelf, sendPreview } from './design-system-preview.js'
import { doorLinkOf, framedRefusal, previewPathOf } from './design-system-preview-links.js'
import { slotOf, themeFoldersFor, wornPageOf } from './design-system-preview-page.js'
import { siteAssetLinkOf } from './design-system-site-preview-assets.js'

/** The id the Template default card's popup asks the preview door for: the site's page wearing no system. */
export { TEMPLATE_DEFAULT_ID }

/**
 * How long a site's home-page words are kept (`GET …/design-system/words`): a panel opened again soon
 * after costs no page render. Words change only when the customer edits the home page, and a card a
 * minute or two behind an edit is still the site's own words — never invented ones.
 */
export const WORDS_TTL_MS = 2 * 60_000
/** Sites whose words are kept at most (the oldest goes first). */
const WORDS_KEPT_MAX = 200

/**
 * How long a running site's preview page is kept (`GET …/design-system/preview`): reopening a card soon
 * after costs no page read. Short, because the customer and the agent edit the site: an apply or undo
 * through these doors forgets the site's pages at once, an edit elsewhere shows within this long.
 */
export const SITE_PREVIEW_KEEP_MS = 60_000
/** Running-site previews kept at most (a page is ~60 KB to 1.5 MB; the oldest goes first). */
export const SITE_PREVIEW_KEPT_MAX = 24

/**
 * The words a home page gives the panel, or null when it gives none worth drawing (`wordsOf` read no
 * name, heading, lead, call to action or menu): an empty page is not "the site's words".
 * @param {string} html
 * @returns {{ name: string | null, nav: string[], eyebrow: string | null, headline: string | null,
 *   sub: string | null, cta: string | null, cta2: string | null } | null}
 */
export function panelWordsOf(html) {
  const w = wordsOf(html, '')
  const site = {
    name: w.name,
    nav: w.nav,
    eyebrow: w.eyebrow,
    headline: w.headline,
    sub: w.sub,
    cta: w.cta,
    cta2: w.cta2
  }
  const said = [site.name, site.headline, site.sub, site.cta].some((v) => typeof v === 'string' && v !== '')
  return said || site.nav.length > 0 ? site : null
}

/**
 * @param {import('hono').Hono} app
 * @param {{
 *   front: (c: any) => Promise<{ error?: Response, siteKey?: any, auth?: any, site?: any }>,
 *   json: (c: any, body: any, status?: number) => Response,
 *   ds: any,
 *   store: { latest: (siteKey: string) => Promise<any | null> },
 *   offered: () => Promise<any[]>,
 *   fit: ReturnType<typeof import('./design-system-fit.js').designSystemFit>,
 *   platforms: Set<string>,
 *   home?: (site: any) => Promise<string | null>,
 *   now: () => number,
 *   preview?: { innerOf: (site: any) => URL, publicOf: (site: any) => string | null, fetchImpl: typeof fetch,
 *     waitMs?: number, origin?: string | null, secret?: string },
 *   previewRate?: (email: string) => Promise<{ over: boolean, retryAfterS: number }>,
 *   lockedFor?: (email: string | null | undefined, templateKey: string | null | undefined) => Promise<boolean>
 * }} deps see `mountDesignSystem`
 * @returns {{ forgetPreviews: (siteKey: string) => void }}
 */
export function mountDesignSystemReads(app, deps) {
  const { front, json, ds, store, offered, platforms, home, now } = deps
  const { fitOf, versionOf, survey } = deps.fit

  /**
   * The survey door's memory: site key → what one read in the container said about the template and its
   * release, and when. A WordPress hint from the panel is never trusted on its own (its theme version is
   * only known after a read; measured 13/10/2026: a theme merely named "tracy" at 0.1.0 was taken for
   * tracy-base and the preview answered 502), so the preview asks the survey, kept a minute so the pages
   * a visitor opens inside the popup do not each run a job.
   */
  const surveyKept = new Map()
  const SURVEY_KEEP_MS = 60_000
  async function surveyFor(siteKey, site) {
    const kept = surveyKept.get(siteKey)
    if (kept && now() - kept.at < SURVEY_KEEP_MS) return kept.said
    const said = await survey(site)
    if (!said.failed) {
      surveyKept.delete(siteKey)
      surveyKept.set(siteKey, { said, at: now() })
      while (surveyKept.size > WORDS_KEPT_MAX) surveyKept.delete(surveyKept.keys().next().value)
    }
    return said
  }

  /** The words door's memory: site key → the words (or null) and when they were read. */
  const wordsKept = new Map()
  /** One read per site at a time: a second panel opened during a read waits for the same one. */
  const wordsReading = new Map()

  /** The site's home-page words, from memory while fresh, else read once. */
  async function wordsFor(siteKey, site) {
    const kept = wordsKept.get(siteKey)
    if (kept && now() - kept.at < WORDS_TTL_MS) return kept.words
    const reading = wordsReading.get(siteKey)
    if (reading) return reading
    const read = (async () => {
      let html = null
      try {
        html = home ? await home(site) : null
      } catch {
        html = null
      }
      const words = typeof html === 'string' && html !== '' ? panelWordsOf(html) : null
      // Only a page that was read is kept: a site that could not answer is asked again next time.
      if (typeof html === 'string') {
        wordsKept.delete(siteKey)
        wordsKept.set(siteKey, { words, at: now() })
        while (wordsKept.size > WORDS_KEPT_MAX) wordsKept.delete(wordsKept.keys().next().value)
      }
      return words
    })()
    wordsReading.set(siteKey, read)
    try {
      return await read
    } finally {
      wordsReading.delete(siteKey)
    }
  }

  app.get('/api/sites/:key/design-system/words', async (c) => {
    const f = await front(c)
    if (f.error) return f.error
    const words = await wordsFor(f.siteKey, f.site)
    return json(c, words === null ? { present: false } : { present: true, source: 'home', site: words })
  })

  const previewRate = deps.previewRate ?? previewRateLimiter({ now })
  /** The preview door's memory, keyed `<siteKey>\n…` so one site's pages are forgotten together. */
  const shelf = previewShelf({ keepMs: SITE_PREVIEW_KEEP_MS, max: SITE_PREVIEW_KEPT_MAX, now })
  /** Every kept preview of a site: after an apply or an undo, what it wears is not what they show. */
  const forgetPreviews = (/** @type {string} */ siteKey) => shelf.forget(`${siteKey}\n`)

  /**
   * The site's contract for a preview, judged exactly as an apply judges it: EmDash by its quickstart
   * tag; WordPress / Joomla by the template the panel read (`hint`, checked against the site's own
   * release) or, without one, by one read in the container.
   * @returns {Promise<{ templateKey: string | null, fit: any } | { failed: string }>}
   */
  async function previewFitOf(site, siteKey, hint) {
    if (site.platform === 'emdash') return fitOf(site, null)
    // Joomla: the hint is judged against the site's own release, as an apply judges it. WordPress: the
    // release is the theme's version, known only to a read in the container, so the survey decides.
    const hinted = hint && site.platform === 'joomla' ? ds.contractFor(hint, versionOf(site, null)) : null
    if (hinted && 'contract' in hinted && ds.rawTemplatesOf(hint).length > 0)
      return { templateKey: hint, fit: hinted }
    const s = await surveyFor(siteKey, site)
    return s.failed ? { failed: s.failed } : { templateKey: s.templateKey, fit: s.fit }
  }

  app.get('/api/sites/:key/design-system/preview', async (c) => {
    // `path`: asked by a link inside the popup's frame; every refusal is then a small page in the frame.
    const rawPath = c.req.query('path')
    const inFrame = rawPath !== undefined
    const doorOf = doorLinkOf(c.req.url, { origin: deps.preview?.origin, keep: ['id', 'template'] })
    const say = (status, body, why) =>
      inFrame
        ? framedRefusal(c, status, {
            why,
            home: why === 'INVALID_PATH' || status === 404 ? doorOf('/') : null
          })
        : json(c, body, status)
    const f = await front(c)
    if (f.error)
      return inFrame
        ? framedRefusal(c, f.error.status, { why: f.error.status === 401 ? 'NOT_SIGNED_IN' : 'NO_ACCESS' })
        : f.error
    // Counted once the account is known, before anything else is read: every ask spends one, a page
    // opened by a link inside the preview as much as the popup's first.
    const rate = await previewRate(String(f.auth.email ?? ''))
    if (rate.over)
      return inFrame
        ? framedRefusal(c, 429, { why: 'RATE_LIMITED', retryAfterS: rate.retryAfterS })
        : previewRateLimited(c, rate.retryAfterS)
    const { siteKey, site } = f
    const id = libraryIdOf(String(c.req.query('id') ?? ''))
    const rawHint = c.req.query('template')
    const hint = typeof rawHint === 'string' && rawHint !== '' && rawHint.length <= 200 ? rawHint : null
    if (!id || id.length > 120) return say(400, { code: 'INVALID_REQUEST' }, 'INVALID_REQUEST')
    // A path of the site only: never a host, a scheme or an escape (`previewPathOf`).
    const path = inFrame ? previewPathOf(rawPath) : '/'
    if (path === null) return say(400, { code: 'INVALID_REQUEST', reason: 'PATH' }, 'INVALID_PATH')
    // The template's own look is not a system of the library: nothing to look up, nothing to lay in.
    const bare = id === TEMPLATE_DEFAULT_ID
    if (!bare) {
      const entry = (await offered()).find((s) => s.id === id)
      if (!entry) return say(400, { code: 'DS_UNKNOWN' }, 'DS_UNKNOWN')
      if (!entry.ok) return say(400, { code: 'DS_REFUSED' }, 'DS_REFUSED')
    }
    // An imported site is shown no new look, staff included (`lib/design-system-imported-site.js`); its own page stays.
    if (!bare && isImportedSite(site)) return say(403, { code: DS_IMPORTED_SITE }, DS_IMPORTED_SITE)
    const unavailable = (reason, status = 409) =>
      say(status, { code: 'DS_PREVIEW_UNAVAILABLE', reason }, reason)
    const failed = (reason, status = 502) => say(status, { code: 'DS_PREVIEW_FAILED', reason }, reason)
    if (!platforms.has(String(site.platform))) return unavailable('PLATFORM')
    if (!deps.preview) return failed('NOT_WIRED')
    const { innerOf, publicOf, fetchImpl } = deps.preview
    let pub
    try {
      pub = new URL(String(publicOf(site)))
    } catch {
      return failed('NO_ADDRESS')
    }
    if (pub.protocol !== 'http:' && pub.protocol !== 'https:') return failed('NO_ADDRESS')
    const judged = await previewFitOf(site, siteKey, hint)
    if ('failed' in judged) return failed('SITE_UNREADABLE')
    const { templateKey, fit } = judged
    if ('reason' in fit) return unavailable('NO_SLOT')
    // The customer lock: no new look shown on a template customers may not pick for; its own look stays.
    if (!bare && deps.lockedFor && (await deps.lockedFor(f.auth.email, templateKey)))
      return say(403, { code: DS_TEMPLATE_LOCKED }, DS_TEMPLATE_LOCKED)
    // The live frame (`live=1`, 17/10/2026): the popup frames the site itself at its own address, scripts
    // running, so what it shows is what Try on shows. Nothing is read here: the door signs what it judged
    // (`lib/ds-preview-ticket.js`) and the site proxy lays the same bytes into the page it serves
    // (`design-system-live-page.js`).
    if (c.req.query('live') === '1' && !inFrame)
      return liveFrame({ c, site, siteKey, id, bare, pub, templateKey, fit })
    // Kept per (site, its release and template, its newest apply, system, page): a look changed through
    // these doors is also forgotten at once (`forgetPreviews`).
    const last = lastOf(await store.latest(siteKey))
    const key = [
      siteKey,
      site.quickstart_version ?? '',
      templateKey ?? '',
      last ? `${last.applyId}:${last.undone}` : '',
      id,
      path
    ].join('\n')
    const answer = await shelf.take(key, async () => {
      try {
        let slot = { bytes: '', globalCss: null }
        if (!bare) {
          const out = await ds.emitFor({
            platform: site.platform,
            contract: fit.contract,
            id,
            fontFaces: ds.fontFaces
          })
          slot = out.ok ? slotOf(out) : null
          if (slot === null) return { unavailable: 'NO_SLOT' }
        }
        const page = await wornPageOf({
          platform: site.platform,
          ...slot,
          bare,
          themes: themeFoldersFor(templateKey),
          inner: innerOf(site),
          pub,
          fetchImpl,
          waitMs: deps.preview?.waitMs,
          path,
          doorOf,
          // The site's stylesheets and the fonts they name through Tracy's origin, as the frame's: the
          // site sends no CORS header, so its icon fonts were refused (`design-system-site-preview-assets.js`).
          assetOf: siteAssetLinkOf(c.req.url, { origin: deps.preview?.origin })
        })
        return 'miss' in page ? { failed: 'SITE_UNREADABLE', miss: page.miss } : page
      } catch {
        return { failed: 'SITE_UNREADABLE' }
      }
    })
    if (typeof answer.html === 'string') return sendPreview(c, answer.html)
    if (answer.unavailable) return unavailable(answer.unavailable)
    // A page this template cannot dress (another theme, no global styles block): not available, popup or frame.
    if (answer.miss === 'NO_SLOT') return unavailable('NO_SLOT')
    if (answer.miss === 'NO_BARE') return unavailable('NO_BARE')
    // Inside the frame, a page the site has not got says so; the popup's own ask keeps its one reason.
    if (inFrame && answer.miss === 'PAGE_NOT_FOUND') return failed('PAGE_NOT_FOUND', 404)
    if (inFrame && answer.miss && answer.miss !== 'UNREADABLE') return unavailable(answer.miss)
    return failed(answer.failed ?? 'SITE_UNREADABLE')
  })

  /**
   * The live frame's answer: `{ live: true, src, mode }`, `src` the site's home at its own address with the
   * ticket, `mode` the side the system opens on (the mode line in its bytes; null when it says none).
   * @param {{ c: any, site: any, siteKey: string, id: string, bare: boolean, pub: URL, templateKey: string | null,
   *   fit: any }} q
   */
  async function liveFrame({ c, site, siteKey, id, bare, pub, templateKey, fit }) {
    const secret = deps.preview?.secret
    if (!secret) return json(c, { code: 'DS_PREVIEW_FAILED', reason: 'NOT_WIRED' }, 502)
    const unavailable = (/** @type {string} */ reason) =>
      json(c, { code: 'DS_PREVIEW_UNAVAILABLE', reason }, 409)
    let mode = null
    if (!bare) {
      let slot = null
      try {
        const out = await ds.emitFor({
          platform: site.platform,
          contract: fit.contract,
          id,
          fontFaces: ds.fontFaces
        })
        slot = out.ok ? slotOf(out) : null
      } catch {
        slot = null
      }
      if (slot === null) return unavailable('NO_SLOT')
      mode = /\/\*\s*mode:\s*(dark|light)\s*\*\//.exec(`${slot.bytes}${slot.globalCss ?? ''}`)?.[1] ?? null
    } else if (site.platform === 'wordpress') {
      // A WordPress site wearing a system cannot be shown bare: the system is merged into its global styles.
      const s = await surveyFor(siteKey, site)
      if (s.failed) return json(c, { code: 'DS_PREVIEW_FAILED', reason: 'SITE_UNREADABLE' }, 502)
      if (s.read?.slot) return unavailable('NO_BARE')
    }
    const ticket = mintDsPreviewTicket(
      secret,
      { site: siteKey, id, contract: bare ? '' : String(fit.contract), template: templateKey ?? '' },
      now()
    )
    const src = new URL('/', pub)
    src.searchParams.set(DS_PREVIEW_PARAM, ticket)
    return json(c, { live: true, src: src.href, mode })
  }

  return { forgetPreviews }
}
