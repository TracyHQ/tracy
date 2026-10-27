/**
 * The site start screen's Design system card (Akemi U2 A, 12/10/2026): what its end says, and how
 * pressing it opens the Design system tab.
 *
 * The read is a copy of `@tracy/dsh-design-inspiration` `design-system-door.mjs` `readDesignSystem`
 * (plugins do not import each other's internals): `GET /api/sites/:key/design-system`, root-absolute
 * with the page's cookie. The press rides the same page event the site browser toolbar's Design system
 * button sends (`design-system-toolbar.mjs`), so both doors open one tab and the toolbar keeps its own.
 */

export const DS_TOOLBAR_PRESS_EVENT = 'tracy:design-system-toolbar-press'
/** The operator's switch for the Design system button (`catalogue.json`); the card follows it. */
export const DS_SWITCH = 'toolbar-design-system'
export const DS_TAB = 'tracy:design-system'

/**
 * What the card's end shows for one answer of the door.
 * - `{kind: 'none'}`: the door refused, failed or does not exist for this site, or the site's template is closed to
 *   customers (`locked: true`, tracy-web `lib/design-system-customer-lock.js`) and the site wears no system: no card.
 * - `{kind: 'worn', name}`: the name of the system the site wears now.
 * - `{kind: 'default'}`: the door answered and the site wears no system (template default).
 * @param {{ ok: boolean, body?: any }} answer
 * @returns {{ kind: 'none' } | { kind: 'default' } | { kind: 'worn', name: string }}
 */
export function designSystemCardOf(answer) {
  if (!answer || answer.ok !== true || !answer.body || typeof answer.body !== 'object')
    return { kind: 'none' }
  const name = answer.body.worn?.name
  if (typeof name === 'string' && name.trim() !== '') return { kind: 'worn', name: name.trim() }
  // A template customers may not pick a system for: no row to open, the site keeps the template's own look. A site
  // that already wears one keeps its row above, so the tab can still say what it wears and undo it.
  return answer.body.locked === true ? { kind: 'none' } : { kind: 'default' }
}

/**
 * Read what `siteKey` wears. Never throws: an unreachable door answers `{ok: false}`.
 * @param {string} siteKey @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ ok: true, body: any } | { ok: false, status: number }>}
 */
export async function readWornDesignSystem(
  siteKey,
  fetchImpl = (input, init) => globalThis.fetch(input, init)
) {
  let res
  try {
    res = await fetchImpl(`/api/sites/${encodeURIComponent(siteKey)}/design-system`, {
      credentials: 'same-origin'
    })
  } catch {
    return { ok: false, status: 0 }
  }
  const body = await res.json().catch(() => null)
  if (res.ok && body && body.code === undefined) return { ok: true, body }
  return { ok: false, status: res.status }
}

/**
 * Open the Design system tab of `siteKey` the way the toolbar button does.
 * @param {EventTarget} target @param {string} siteKey @param {string | undefined} sessionId
 */
export function pressDesignSystem(target, siteKey, sessionId) {
  target.dispatchEvent(
    new CustomEvent(DS_TOOLBAR_PRESS_EVENT, { detail: { siteKey, sessionId: sessionId ?? '' } })
  )
}
