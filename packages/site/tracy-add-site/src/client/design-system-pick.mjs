/**
 * The "Design system" pick of the Add site form (U1 A + U7 A, Akemi 12/10/2026), with no React: the library, whether
 * the template in sight can wear a system, and what the server says of the pick while it builds the site.
 *
 * Three doors, all tracy-web's:
 *   - `GET /api/design-system/library` → `{ systems: [...] }`; only `ok` rows are offered.
 *   - `GET /api/design-system/support?quickstart=<tag>&platform=<cms>` → `{ supported, reason, need, have }`.
 *     A door that does not answer, or answers anything but `supported: true`, is NOT support: the form never
 *     promises a look the template cannot wear.
 *   - `GET /api/design-system/preview?quickstart=<tag>&platform=<cms>&id=<id>` → the template's live demo
 *     wearing the system (HTML), asked only when the preview popup opens (`readPreview`).
 *   - `POST /api/sites/<siteKey>/design-system` with `{ id }`: only Try again on the ready screen, after the server
 *     said its own write did not land (`applyPick`).
 *
 * The pick travels WITH Create site (`POST /api/sites {designSystem: <library id>}`, Akemi 12/10/2026): the server
 * keeps it on the new site and puts it on at the end of the build, so a reload or a closed tab no longer loses it. The
 * build's poll says how far it got (`designSystem` beside the job: `jobPickOf`), and the wizard draws that line
 * (`pickLine`).
 *
 * Plain JavaScript so `node --test` runs it without a build step.
 */
import { tracyWebFetch } from '@tracy/core/web-path'

/**
 * @typedef {{ id: string, kind: string, name: string, description: string, group: string | null,
 *   theme?: string | null, image: string | null, fonts: unknown, colors?: unknown, ok: boolean }} LibraryRow
 * @typedef {{ id: string, name: string, image: string | null, font: string | null }} DesignSystemPick
 */

/**
 * The first font family a library row names, for the swatch card when the row has no picture. The library's `fonts`
 * shape is read loosely (a list of names, a list of `{ name|family }`, or `{ display, body, heading }`): a shape it does
 * not know gives null and the card uses the page's own font.
 * @param {unknown} fonts
 * @returns {string | null}
 */
export function fontOf(fonts) {
  /** @param {any} f A font entry: a family name, or an object with `family` or `name`. */
  const name = (f) =>
    typeof f === 'string' ? f : f && typeof f === 'object' ? (f.family ?? f.name ?? null) : null
  if (Array.isArray(fonts)) {
    for (const f of fonts) {
      const n = name(f)
      if (typeof n === 'string' && n.trim()) return n.trim()
    }
    return null
  }
  if (fonts && typeof fonts === 'object') {
    const o = /** @type {any} */ (fonts)
    for (const key of ['display', 'heading', 'body']) {
      const n = name(o[key])
      if (typeof n === 'string' && n.trim()) return n.trim()
    }
  }
  return null
}

/** Swatches a card draws at most: the Design inspiration card's own count (`Gallery.tsx`). */
export const SWATCHES_SHOWN = 4

/**
 * The swatches a library row's card draws: the system's own palette as the library door sends it (`colors`, accent
 * first), hex values only, at most `SWATCHES_SHOWN`. A row with no palette gives none; nothing is guessed.
 * @param {LibraryRow | null | undefined} row
 * @returns {string[]}
 */
export function swatchesOf(row) {
  const list = row?.colors
  if (!Array.isArray(list)) return []
  /** @type {string[]} */
  const out = []
  for (const c of list) {
    if (typeof c !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(c)) continue
    const hex = c.toLowerCase()
    if (!out.includes(hex)) out.push(hex)
    if (out.length >= SWATCHES_SHOWN) break
  }
  return out
}

/**
 * The rows the sheet offers: `ok` ones with an id and a name, in the library's order. An OpenDesign row (`od:<id>`,
 * from an older server) is never offered: the library is Refero's alone since 12/10/2026 (Akemi), and the apply door
 * refuses it.
 * @param {unknown} body The JSON of the library door.
 * @returns {LibraryRow[] | null} null when the body is not a library at all.
 */
export function shownSystems(body) {
  const list = /** @type {any} */ (body)?.systems
  if (!Array.isArray(list)) return null
  return list.filter(
    (/** @type {any} */ s) =>
      s &&
      s.ok === true &&
      typeof s.id === 'string' &&
      s.id &&
      !s.id.startsWith('od:') &&
      typeof s.name === 'string' &&
      s.name
  )
}

/**
 * The pick a library row becomes: what the card and the apply step need, nothing more.
 * @param {LibraryRow} row
 * @returns {DesignSystemPick}
 */
export function pickOf(row) {
  return {
    id: row.id,
    name: row.name,
    image: typeof row.image === 'string' && row.image ? row.image : null,
    font: fontOf(row.fonts)
  }
}

/**
 * The quickstart tag of the template card's build on a platform (`GET /api/templates` puts one per platform entry).
 * @param {any} card
 * @param {string | undefined} platform
 * @returns {string | undefined}
 */
export function quickstartTagOf(card, platform) {
  if (!platform || !Array.isArray(card?.platforms)) return undefined
  const entry = card.platforms.find((/** @type {any} */ p) => p?.platform === platform)
  return typeof entry?.tag === 'string' && entry.tag ? entry.tag : undefined
}

/** @type {Promise<LibraryRow[] | null> | null} */
let libraryRead = null

/**
 * The library, read once per page: its rows (about a thousand) never change while a form is open. A failed read is not kept, so
 * Try again asks the door again.
 * @param {typeof tracyWebFetch} [doFetch]
 * @returns {Promise<LibraryRow[] | null>} null when the door did not answer with a library.
 */
export function readLibrary(doFetch = tracyWebFetch) {
  if (libraryRead) return libraryRead
  const read = doFetch('/api/design-system/library', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => shownSystems(body))
    .catch(() => null)
  libraryRead = read
  void read.then((rows) => {
    if (rows === null && libraryRead === read) libraryRead = null
  })
  return read
}

/** Forget the cached library read (tests). */
export function resetLibrary() {
  libraryRead = null
}

/**
 * Whether the template build in sight can wear a design system. Anything but a door answering `supported: true` is
 * "no": no tag to ask about, a 404, a network error, a body that says something else.
 * @param {{ quickstart: string | undefined, platform: string | undefined }} input
 * @param {typeof tracyWebFetch} [doFetch]
 * @returns {Promise<boolean>}
 */
export async function readSupport({ quickstart, platform }, doFetch = tracyWebFetch) {
  if (!quickstart || !platform) return false
  const query = new URLSearchParams({ quickstart, platform })
  try {
    const res = await doFetch(`/api/design-system/support?${query.toString()}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' }
    })
    if (!res.ok) return false
    const body = /** @type {any} */ (await res.json())
    return body?.supported === true
  } catch {
    return false
  }
}

/**
 * How long the popup waits for its page before it offers Try again. The door itself gives the demo
 * 10 s per hop; a first build of a WordPress system also resolves its fonts. Past this the read is
 * aborted: measured 12/10/2026 on the local stand, a request queued behind a full HTTP/1.1 pool
 * (six connections per host, shared by every Tracy tab) sat a minute with no answer, and the popup
 * said "Loading the preview" the whole time.
 */
export const PREVIEW_WAIT_MS = 25_000

/**
 * The header the preview door sends with the page of a template whose contract wears both sides of its light/dark
 * switch (tracy-web `design-system-preview.js` `MODES_HEADER`).
 */
export const MODES_HEADER = 'x-tracy-ds-modes'

/**
 * The side a two-mode template's preview opens on: the system's own mode, as the worn sheet names it in its first
 * lines (a mode comment, `mode: dark` or `mode: light`, written by `tracy-ds-slot` for a `modes: true` contract), else
 * the library row's `theme` when it is dark, else light (the template's default side). A port of
 * `tracy-design-inspiration` `previewModeOf`: a plugin never imports another plugin's internals.
 * @param {string | null | undefined} html the preview page
 * @param {string | null | undefined} systemTheme the library row's `theme`
 * @returns {'light' | 'dark'}
 */
export function previewModeOf(html, systemTheme) {
  const said = /\/\*\s*mode:\s*(dark|light)\s*\*\//.exec(String(html ?? ''))
  if (said) return /** @type {'light' | 'dark'} */ (said[1])
  return systemTheme === 'dark' ? 'dark' : 'light'
}

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
 * The preview popup's page: the template's live demo wearing the system, as the preview door renders it.
 *   - `ready`: the page, for an `<iframe sandbox="" srcDoc>`;
 *   - `unavailable`: the door said no preview can be made (`DS_PREVIEW_UNAVAILABLE`: a platform it cannot
 *     preview yet, no live demo, a demo it could not read, a demo release that cannot wear it); picking still works;
 *   - `failed`: anything else (no answer within `waitMs`, a refusal, an empty page); the popup offers Try again.
 * Nothing is asked without a tag or a platform: that is `unavailable`, never a guess.
 *
 * LIVE (`live`, the popup, 18/10/2026): asked with `live=1`, the door answers `{ live: true, src, mode, modes }`: the
 * template's demo itself at its own address with a signed ticket, which the popup frames with the page's scripts
 * running, so it shows what Try on shows (an Owl carousel, a sticky header, lazy pictures); `mode` is the side the
 * system opens on. A door from before that, and the sheet's picture (no `live`), get the static page (`html`).
 * @param {{ quickstart: string | undefined, platform: string | undefined, id: string, live?: boolean }} input
 * @param {typeof tracyWebFetch} [doFetch]
 * @param {{ waitMs?: number }} [opts]
 * A page of a two-mode template comes with the door's `x-tracy-ds-modes: both` header ({@link MODES_HEADER}): `modes`, so
 * the popup offers Light | Dark.
 * @returns {Promise<{ at: 'ready', html: string, modes?: true }
 *   | { at: 'ready', src: string, mode: 'light' | 'dark' | null, modes?: true } | { at: 'unavailable' } | { at: 'failed' }>}
 */
export async function readPreview(
  { quickstart, platform, id, live = false },
  doFetch = tracyWebFetch,
  { waitMs = PREVIEW_WAIT_MS } = {}
) {
  if (!quickstart || !platform || !id) return { at: 'unavailable' }
  const query = new URLSearchParams({ quickstart, platform, id })
  if (live) query.set('live', '1')
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
      const res = await doFetch(`/api/design-system/preview?${query.toString()}`, {
        credentials: 'same-origin',
        headers: { accept: live ? 'application/json, text/html' : 'text/html' },
        signal: abort.signal
      })
      if (res.ok) {
        if (/json/i.test(res.headers?.get('content-type') ?? '')) {
          const body = /** @type {any} */ (await res.json().catch(() => null))
          const src = liveSrcOf(body?.src)
          if (!body?.live || src === null) return { at: 'failed' }
          const mode = body.mode === 'dark' || body.mode === 'light' ? body.mode : null
          return body.modes === true ? { at: 'ready', src, mode, modes: true } : { at: 'ready', src, mode }
        }
        const html = await res.text()
        if (!html) return { at: 'failed' }
        return res.headers?.get(MODES_HEADER) === 'both'
          ? { at: 'ready', html, modes: true }
          : { at: 'ready', html }
      }
      const body = /** @type {any} */ (await res.json().catch(() => null))
      return body?.code === 'DS_PREVIEW_UNAVAILABLE' ? { at: 'unavailable' } : { at: 'failed' }
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
 * @typedef {{ id: string, name: string, state: 'queued' | 'applying' | 'applied' | 'skipped' | 'failed',
 *   reason: string | null }} JobPick
 */

const PICK_STATES = new Set(['queued', 'applying', 'applied', 'skipped', 'failed'])

/**
 * The pick as the build's poll reports it (`designSystem` beside the job, `sites/route.js`), or null when the job
 * carries none or something this client does not know. A pick with no name is said by its id, never by nothing.
 * @param {unknown} raw
 * @returns {JobPick | null}
 */
export function jobPickOf(raw) {
  const o = /** @type {any} */ (raw)
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  if (typeof o.id !== 'string' || o.id === '' || !PICK_STATES.has(o.state)) return null
  return {
    id: o.id,
    name: typeof o.name === 'string' && o.name ? o.name : o.id,
    state: o.state,
    reason: typeof o.reason === 'string' && o.reason ? o.reason : null
  }
}

/**
 * The line the build and ready screens draw for the pick: under way while the server waits or writes, done once it is
 * on, failed when it was not put on (the template could not wear it, or the write did not land).
 * @param {JobPick | null | undefined} pick
 * @returns {{ at: 'running' | 'done' | 'failed', name: string } | null}
 */
export function pickLine(pick) {
  if (!pick) return null
  const at =
    pick.state === 'applied'
      ? 'done'
      : pick.state === 'queued' || pick.state === 'applying'
        ? 'running'
        : 'failed'
  return { at, name: pick.name }
}

/**
 * Write the picked system to the new site: Try again on the ready screen, when the server's own write did not land.
 * @param {string} siteKey
 * @param {string} id
 * @param {typeof tracyWebFetch} [doFetch]
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
export async function applyPick(siteKey, id, doFetch = tracyWebFetch) {
  try {
    const res = await doFetch(`/api/sites/${encodeURIComponent(siteKey)}/design-system`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ id })
    })
    if (res.ok) return { ok: true }
    const body = /** @type {any} */ (await res.json().catch(() => null))
    return { ok: false, code: typeof body?.code === 'string' ? body.code : `HTTP_${res.status}` }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}
