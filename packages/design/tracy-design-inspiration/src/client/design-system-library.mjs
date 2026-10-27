/**
 * The Design system tab's library and its try-on, as pure helpers (Akemi's decisions 12/10/2026:
 * U3 A try on then Keep or Undo, U4 A the card's own picture, U5 A its real name, U10 A the font line).
 *
 * - `fetchLibrary`: tracy-web `GET /api/design-system/library`, root-absolute with the page's cookie
 *   like the other Design system doors. The library is Refero's alone (Akemi, 12/10/2026): a row of any
 *   other kind (an OpenDesign `od:<id>`, from an older server) is dropped, never offered.
 * - `libraryRowsOf`: the rows the tab lists — only those the door marks `ok`, minus the read's refused
 *   ids, searched over name, description and group.
 * - `fontPartsOf`: the one line under the preview that says which free font stands in for the
 *   system's own (licensed) one.
 * - `switchStepsOf` / `undoTargetOf`: what a press does while a try-on is up. A second card is put on
 *   by undoing the first try and then applying the new one, so the newest apply always remembers the
 *   look from before the first try, and Undo returns exactly there (the undo door only undoes the
 *   newest apply).
 */

const LIBRARY = '/api/design-system/library'

/**
 * @typedef {{ use: string, for: string | null }} FontSwap
 * @typedef {{ id: string, kind: 'refero', name: string, description: string, group: string,
 *   theme: string | null, image: string | null, fonts: FontSwap[], colors: string[], ok: boolean }} LibrarySystem
 */

/**
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ ok: true, systems: LibrarySystem[] } | { ok: false, code: string, status: number }>}
 */
export async function fetchLibrary(fetchImpl = fetch) {
  let res
  try {
    res = await fetchImpl(LIBRARY, { credentials: 'same-origin', headers: { accept: 'application/json' } })
  } catch {
    return { ok: false, code: 'NETWORK', status: 0 }
  }
  const body = await res.json().catch(() => null)
  if (res.ok && body && Array.isArray(body.systems))
    return {
      ok: true,
      systems: /** @type {any[]} */ (body.systems)
        .map(systemOf)
        .filter(/** @returns {s is LibrarySystem} */ (/** @type {LibrarySystem | null} */ s) => s !== null)
    }
  return {
    ok: false,
    code: typeof body?.code === 'string' ? body.code : `HTTP_${res.status}`,
    status: res.status
  }
}

const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')

/**
 * One row of the door, checked: a Refero id (`refero:<uuid>`, the only kind the apply door takes), a
 * name, and the rest normalised (no image → null, fonts → only pairs with a font in use).
 * @param {any} row
 * @returns {LibrarySystem | null}
 */
export function systemOf(row) {
  const id = text(row?.id)
  if (!/^refero:\S+$/.test(id) || text(row?.name) === '') return null
  const fonts = Array.isArray(row.fonts)
    ? row.fonts
        .map((/** @type {any} */ f) => ({ use: text(f?.use), for: text(f?.for) || null }))
        .filter((/** @type {FontSwap} */ f) => f.use !== '')
    : []
  return {
    id,
    kind: 'refero',
    name: text(row.name),
    description: text(row.description),
    group: text(row.group),
    // light, dark or mixed (the catalogue's look), the Theme filter's key; null from an older server.
    theme: ['light', 'dark', 'mixed'].includes(text(row.theme)) ? text(row.theme) : null,
    image: text(row.image) || null,
    fonts,
    // The system's own palette, accent first, as the door sends it: the card's dots (`swatchesOf`).
    colors: Array.isArray(row.colors)
      ? row.colors.filter((/** @type {unknown} */ c) => typeof c === 'string')
      : [],
    ok: row.ok === true
  }
}

/**
 * @param {LibrarySystem[]} systems
 * @param {string[]} refused the read's `refused` (library ids)
 * @param {string} query
 */
export function libraryRowsOf(systems, refused, query) {
  const out = new Set(refused)
  const q = query.trim().toLowerCase()
  return systems.filter(
    (s) =>
      s.ok &&
      !out.has(s.id) &&
      (q === '' || [s.name, s.description, s.group].some((v) => v.toLowerCase().includes(q)))
  )
}

/**
 * The font line under the preview ("Fonts: Inter stands in for Airbnb Cereal"): one part per font,
 * each a string key of `strings.ts` the tab says and joins with commas — a swap names both fonts, a
 * font used as it is names itself. Empty when the system names no font (the tab then draws no line).
 * @param {FontSwap[] | undefined} fonts
 * @returns {{ key: 'ds.font.swap' | 'ds.font.same', params: Record<string, string> }[]}
 */
export function fontPartsOf(fonts) {
  if (!Array.isArray(fonts)) return []
  const seen = new Set()
  const parts = []
  for (const f of fonts) {
    if (!f?.use) continue
    const swap = f.for && f.for !== f.use
    const sig = `${f.use}|${swap ? f.for : ''}`
    if (seen.has(sig)) continue
    seen.add(sig)
    parts.push(
      swap
        ? { key: /** @type {const} */ ('ds.font.swap'), params: { use: f.use, original: String(f.for) } }
        : { key: /** @type {const} */ ('ds.font.same'), params: { use: f.use } }
    )
  }
  return parts
}

/**
 * @typedef {{ id: string, name: string } | null} Look  what a site wears: a system, or the template's own look (null)
 * @typedef {{ before: Look, current: { id: string, name: string }, applyId: string | null }} Trial
 */

/**
 * The door presses a "Try on" needs: nothing when the picked system is the one being tried; undo the
 * current try first when one is up (so Undo still leads back to the look before the first try); else
 * apply.
 * @param {Trial | null} trial
 * @param {string} picked
 * @returns {('undo' | 'apply')[]}
 */
export function switchStepsOf(trial, picked) {
  if (!trial) return ['apply']
  if (trial.current.id === picked) return []
  return trial.applyId ? ['undo', 'apply'] : ['apply']
}

/**
 * The bar's second line: back to the system worn before the first try, or to the template's own look.
 * @param {Trial} trial
 * @returns {{ key: 'ds.try.back' | 'ds.try.back.none', params: Record<string, string> }}
 */
export function undoTargetOf(trial) {
  return trial.before
    ? { key: 'ds.try.back', params: { name: trial.before.name } }
    : { key: 'ds.try.back.none', params: {} }
}

/**
 * The address the try-on frames: the site's served address (`copyUrl` of the shared `/api/sites`
 * answer — the same one the Browser tab opens), with a counter so each apply loads it fresh. Null when
 * the site has no address yet: the tab then keeps the sample card, never a guessed URL.
 * @param {unknown} copyUrl
 * @param {number} round
 */
export function liveSiteUrlOf(copyUrl, round) {
  if (typeof copyUrl !== 'string' || copyUrl === '') return null
  try {
    const url = new URL(copyUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (round > 0) url.searchParams.set('tracy_ds', String(round))
    return url.href
  } catch {
    return null
  }
}
