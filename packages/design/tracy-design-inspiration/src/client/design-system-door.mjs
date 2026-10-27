/**
 * The Design system tab's talk with tracy-web (`apps/tracy-web/src/sites/design-system.js`): read what
 * the site wears, apply a system, undo the newest apply. These are tracy-web doors, so they are written
 * root-absolute with the page's cookie (like `/api/sites`), never through `dshUrl()`.
 *
 * Every refusal comes back as `{ok: false, code}`, and `messageKeyOf` turns a code into the words the
 * tab says (`strings.ts`, `ds.error.*`) — a code with no words of its own says the generic sentence
 * with the code, never nothing.
 */

/** @param {string} siteKey */
const base = (siteKey) => `/api/sites/${encodeURIComponent(siteKey)}/design-system`

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ ok: true, body: any } | { ok: false, code: string, status: number }>}
 */
async function call(url, init, fetchImpl = fetch) {
  let res
  try {
    res = await fetchImpl(url, { credentials: 'same-origin', ...init })
  } catch {
    return { ok: false, code: 'NETWORK', status: 0 }
  }
  const body = await res.json().catch(() => null)
  if (res.ok && body && body.code === undefined) return { ok: true, body }
  return {
    ok: false,
    code: typeof body?.code === 'string' ? body.code : `HTTP_${res.status}`,
    status: res.status
  }
}

/** @param {string} siteKey @param {typeof fetch} [fetchImpl] */
export const readDesignSystem = (siteKey, fetchImpl) => call(base(siteKey), undefined, fetchImpl)

/**
 * Apply system `id`. `template`: the `template` the last read answered — the door then makes the
 * bytes for it without reading the site again, and the host writes only if the site still runs it.
 * The answer's `read` is the next read (what the site wears after the write): no second call needed.
 * @param {string} siteKey @param {string} id @param {string | null} [template] @param {typeof fetch} [fetchImpl]
 */
export const applyDesignSystem = (siteKey, id, template, fetchImpl) =>
  call(
    base(siteKey),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(typeof template === 'string' && template !== '' ? { id, template } : { id })
    },
    fetchImpl
  )

/** @param {string} siteKey @param {string} applyId @param {typeof fetch} [fetchImpl] */
export const undoDesignSystem = (siteKey, applyId, fetchImpl) =>
  call(
    `${base(siteKey)}/undo`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ applyId }) },
    fetchImpl
  )

/**
 * The site's own words for the cards, read off the home page it serves now (tracy-web
 * `GET …/design-system/words`). Null when the door read nothing, refused, or could not be reached.
 * @param {string} siteKey @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function readSiteWords(siteKey, fetchImpl) {
  const r = await call(`${base(siteKey)}/words`, undefined, fetchImpl)
  return r.ok && r.body?.present === true && r.body.site && typeof r.body.site === 'object'
    ? r.body.site
    : null
}

/**
 * How long a card's preview popup waits for the page before it offers Try again. Past this the read
 * is aborted: measured 12/10/2026 on the local stand, a request queued behind a full HTTP/1.1 pool
 * (six connections per host, shared by every Tracy tab) sat a minute with no answer, and the popup
 * said it was loading the whole time. The door gives the site 10 s per hop.
 */
export const SITE_PREVIEW_WAIT_MS = 25_000

/** The live frame's address as the door gave it: http(s) only, else null. */
function liveSrcOf(/** @type {unknown} */ raw) {
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * The site's own home page wearing system `id`, for a card's preview popup (tracy-web
 * `GET …/design-system/preview`): nothing is written. `template`: the template the last read answered,
 * judged as an apply judges it. Asked only when the popup opens.
 *
 * LIVE (17/10/2026): asked with `live=1`, the door answers `{ live: true, src, mode }`: the site itself at its
 * own address with a signed ticket, which the popup frames with the page's scripts running, so it shows what
 * Try on shows (an Owl carousel, a sticky header, lazy pictures); `mode` is the side the system opens on. A
 * door from before that answers the static page (`html`), which the popup still frames as before.
 * @param {{ siteKey: string | null, id: string, template?: string | null }} q
 * @param {typeof fetch} [fetchImpl]
 * @param {{ waitMs?: number }} [opts]
 * @returns {Promise<{ at: 'ready', html: string } | { at: 'ready', src: string, mode: 'light' | 'dark' | null }
 *   | { at: 'unavailable', reason: string | null } | { at: 'failed' }>}
 *   `unavailable`: the door says the site cannot be previewed (`DS_PREVIEW_UNAVAILABLE`), with its `reason`
 *   (`NO_SLOT`, `PLATFORM`; null when it named none) so the popup can say why; `failed`: anything else, no
 *   answer within `waitMs` included, said with Try again.
 */
export async function readSitePreview(
  { siteKey, id, template },
  fetchImpl = fetch,
  { waitMs = SITE_PREVIEW_WAIT_MS } = {}
) {
  if (!siteKey || !id) return { at: 'unavailable', reason: null }
  const query = new URLSearchParams({ id })
  if (typeof template === 'string' && template !== '') query.set('template', template)
  query.set('live', '1')
  const abort = new AbortController()
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  // The wait ends the read even when the fetch ignores the abort; the abort frees the request.
  const late = new Promise((resolve) => {
    timer = setTimeout(() => {
      abort.abort()
      resolve({ at: 'failed' })
    }, waitMs)
  })
  const read = (async () => {
    try {
      const res = await fetchImpl(`${base(siteKey)}/preview?${query.toString()}`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json, text/html' },
        signal: abort.signal
      })
      if (res.ok) {
        if (/json/i.test(res.headers.get('content-type') ?? '')) {
          const body = /** @type {any} */ (await res.json().catch(() => null))
          const src = liveSrcOf(body?.src)
          if (!body?.live || src === null) return { at: 'failed' }
          return { at: 'ready', src, mode: body.mode === 'dark' || body.mode === 'light' ? body.mode : null }
        }
        const html = await res.text()
        return html ? { at: 'ready', html } : { at: 'failed' }
      }
      const body = /** @type {any} */ (await res.json().catch(() => null))
      if (body?.code !== 'DS_PREVIEW_UNAVAILABLE') return { at: 'failed' }
      return { at: 'unavailable', reason: text(body.reason) }
    } catch {
      return { at: 'failed' }
    }
  })()
  try {
    return /** @type {any} */ (await Promise.race([read, late]))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The side a two-mode template's preview opens on: the system's own mode, as the worn sheet names it in its first
 * lines (`/* mode: dark|light *\/`, written by `tracy-ds-slot` `emit.mjs` / `sides.mjs` for a `modes: true` contract),
 * else the library row's `theme` when it is light or dark, else light (the template's default side).
 * @param {string | null | undefined} html the preview page
 * @param {string | null | undefined} systemTheme the library row's `theme`
 * @returns {'light' | 'dark'}
 */
export function previewModeOf(html, systemTheme) {
  const said = /\/\*\s*mode:\s*(dark|light)\s*\*\//.exec(String(html ?? ''))
  if (said) return /** @type {'light' | 'dark'} */ (said[1])
  return systemTheme === 'dark' ? 'dark' : 'light'
}

const text = (/** @type {unknown} */ v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * The words door's answer as the `SitePreview` the cards wear (`fill.mjs` `planFill`): the words as
 * `site`, one home page. Only what the door read goes in — a missing word stays null, and the card
 * keeps the system's own text in that slot.
 * @param {Record<string, unknown> | null} words
 */
export function previewFromWords(words) {
  if (!words) return null
  const nav = Array.isArray(words.nav) ? words.nav.map(text).filter((t) => t !== null) : []
  const site = {
    name: text(words.name),
    url: '',
    nav,
    eyebrow: text(words.eyebrow),
    headline: text(words.headline),
    sub: text(words.sub),
    cta: text(words.cta),
    cta2: text(words.cta2),
    image: null
  }
  const said = [site.name, site.headline, site.sub, site.cta, site.cta2, site.eyebrow].some((v) => v !== null)
  if (!said && nav.length === 0) return null
  return { site, pages: [{ path: '/', type: 'home', label: 'Home', data: {} }] }
}

/**
 * Whose words the cards wear, as the line under the library says it: the Build's file (`file`), the
 * home page (`page`), still reading (`reading`), or each system's own sample text (`sample`).
 * @param {'file' | 'page' | 'reading' | 'sample'} source
 */
export const wordsLineKeyOf = (source) => `ds.words.${source}`

/** The refusal codes the tab has its own words for. */
export const KNOWN_CODES = Object.freeze([
  'SITE_BUSY',
  'DS_CHANGED_SINCE',
  'DS_NOT_LATEST',
  'DS_UNDO_USED',
  'DS_TEMPLATE_CANNOT_WEAR',
  'DS_REFUSED',
  'TOOLSET_NOT_GRANTED',
  'DS_READ_FAILED',
  'DS_WRITE_FAILED',
  'NETWORK'
])

/** @param {string} code */
export function messageKeyOf(code) {
  return KNOWN_CODES.includes(code) ? `ds.error.${code}` : 'ds.error.other'
}

/** Why a template cannot wear a system, as a string key (`reason` of the read). */
export const UNSUPPORTED_REASONS = Object.freeze([
  'TEMPLATE_HAS_NO_SLOT',
  'TEMPLATE_NOT_READY',
  'NO_TEMPLATE',
  'PLATFORM_HAS_NO_SLOT',
  'SITE_IMPORTED'
])

/**
 * Whether the read closes the whole tab: an imported site (tracy-web `lib/design-system-imported-site.js`, Akemi
 * 15/10/2026) shows its one line instead of the library, since no system can be previewed or applied on it.
 * @param {{ reason?: string, imported?: boolean } | null | undefined} read
 */
export const closesLibrary = (read) => read?.imported === true || read?.reason === 'SITE_IMPORTED'

/**
 * The reasons that name the template's release (older than its contract, newer than the last release checked, or not
 * read). The tab says nothing for them (Akemi, 12/10/2026): the cards stay, Try on stays off, and the fix is an
 * admin's (update the contract in /ops), never the customer's.
 */
export const VERSION_REASONS = Object.freeze([
  'TEMPLATE_NEEDS_UPDATE',
  'TEMPLATE_VERSION_UNCHECKED',
  'TEMPLATE_VERSION_UNKNOWN'
])

/** @param {string | undefined | null} reason */
export const isVersionReason = (reason) => VERSION_REASONS.includes(String(reason))

/** @param {string | undefined} reason */
export function unsupportedKeyOf(reason) {
  return `ds.unsupported.${UNSUPPORTED_REASONS.includes(String(reason)) ? reason : 'TEMPLATE_HAS_NO_SLOT'}`
}

/**
 * The popup's line for a preview the door cannot make (`readSitePreview` `unavailable`), by the door's reason: a
 * template without a slot and a platform without one have the tab's own lines; anything else, the general one.
 * @param {string | null | undefined} reason
 */
export function previewUnavailableKeyOf(reason) {
  if (reason === 'NO_SLOT') return 'ds.unsupported.TEMPLATE_HAS_NO_SLOT'
  if (reason === 'PLATFORM') return 'ds.unsupported.PLATFORM_HAS_NO_SLOT'
  return 'ds.preview.unavailable'
}

/**
 * What the Apply button says and whether it may be pressed, with the reason when it may not.
 * @param {{ read: any, picked: string | null, busy: boolean }} at
 * @returns {{ enabled: boolean, reasonKey: string | null }}
 */
export function applyStateOf({ read, picked, busy }) {
  if (!read) return { enabled: false, reasonKey: null }
  if (!read.canApply) return { enabled: false, reasonKey: 'ds.viewer' }
  if (!read.supported)
    return { enabled: false, reasonKey: isVersionReason(read.reason) ? null : unsupportedKeyOf(read.reason) }
  if (!picked) return { enabled: false, reasonKey: 'ds.pick' }
  // A gallery id (`airbnb`) matches the worn `id`; a library id (`od:airbnb`, `refero:<uuid>`) its `slotId`.
  if (read.worn && (read.worn.id === picked || read.worn.slotId === picked))
    return { enabled: false, reasonKey: 'ds.alreadyWorn' }
  if (busy) return { enabled: false, reasonKey: null }
  return { enabled: true, reasonKey: null }
}
