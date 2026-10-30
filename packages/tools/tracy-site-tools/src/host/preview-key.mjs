/**
 * THE PREVIEW KEY OF A LOCKED SITE (TracyHQ/tracy#189). While a brief build holds a site on its rebuilding page
 * (`apps/tracy-web/src/sites/site-lock.js`), a visitor reads "being updated", and so would the page reads of this
 * plugin: they run the site container's own curl, which carries no token by rule (`exec.mjs` `fetchArgv`). The Cowork
 * plugin answers `X-Tracy-Preview-Key: <key>` with the real site, so the AI turns of the build can still read what they
 * wrote. The key is a fresh random one per lock and dies at unlock.
 *
 * HOW IT IS KNOWN HERE. The host process (never the www-data shell) asks tracy-web for the conversation's own site
 * (`GET /api/sites/_conversation/preview-key`, as the person who typed) at the start of a `tracy_site` call, and keeps
 * the answer for {@link PREVIEW_KEY_TTL_MS} per site label. `page.mjs` `readPage` reads it from here for the site it
 * reads, and adds it only to that site's own loopback curl. 🔒 Held in memory only: never logged, never written to a
 * file (in the container or anywhere), never in an answer, a note or a URL. It may appear in the docker exec argv,
 * which previews only the public site and expires at unlock.
 */

/** The header the plugin's offline bypass reads. */
export const PREVIEW_KEY_HEADER = 'X-Tracy-Preview-Key'
/** The shape of a key the plugin accepts. */
export const PREVIEW_KEY_SHAPE = /^[A-Za-z0-9_-]{32,128}$/
/** How long one answer is kept per site: one ask covers a burst of reads; a lock taken off is forgotten soon after. */
export const PREVIEW_KEY_TTL_MS = 20_000
/** How long the ask may take: a slow tracy-web never holds a read up for long. */
const ASK_TIMEOUT_MS = 3_000

/** @type {Map<string, { at: number, key: string | null }>} */
const previewKeysHeld = new Map()
/** @type {Map<string, () => Promise<unknown>>} the last way each site's key was asked, for a renewal mid-call */
const previewKeyAsks = new Map()

/** The key a read of this site sends now, or null (the site is not locked with one, or nobody asked). */
export function previewKeyFor(/** @type {unknown} */ label) {
  if (typeof label !== 'string') return null
  return previewKeysHeld.get(label)?.key ?? null
}

/**
 * Ask again unless the last answer for this site is still fresh. Any failure is no key: the read goes on as before.
 * @param {string} label
 * @param {() => Promise<unknown>} ask
 * @param {() => number} [now]
 */
export async function refreshPreviewKey(label, ask, now = Date.now) {
  previewKeyAsks.set(label, ask)
  const last = previewKeysHeld.get(label)
  if (last !== undefined && now() - last.at < PREVIEW_KEY_TTL_MS) return last.key
  let key = null
  try {
    const got = await ask()
    key = typeof got === 'string' && PREVIEW_KEY_SHAPE.test(got) ? got : null
  } catch {
    key = null
  }
  previewKeysHeld.set(label, { at: now(), key })
  return key
}

/**
 * A read sent the kept key and got the offline page: tracy-web renewed the key since. Drop the kept one and ask again
 * the way it was last asked; the fresh key, or null.
 * @param {string} label
 * @param {() => number} [now]
 */
export async function renewPreviewKey(label, now = Date.now) {
  const ask = previewKeyAsks.get(label)
  previewKeysHeld.delete(label)
  return ask === undefined ? null : refreshPreviewKey(label, ask, now)
}

/** Forget every key (tests). */
export function forgetPreviewKeys() {
  previewKeysHeld.clear()
  previewKeyAsks.clear()
}

/**
 * The door's answer: the key, or null for any refusal, an older tracy-web without the door (404) or a timeout.
 * @param {{ fetchImpl: typeof fetch, origin: string, headers: Record<string, string> }} input
 * @returns {Promise<string | null>}
 */
export async function askPreviewKey({ fetchImpl, origin, headers }) {
  const res = await fetchImpl(`${origin}/api/sites/_conversation/preview-key`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(ASK_TIMEOUT_MS)
  })
  if (!res.ok) return null
  const body = /** @type {{ key?: unknown } | null} */ (await res.json().catch(() => null))
  return typeof body?.key === 'string' && PREVIEW_KEY_SHAPE.test(body.key) ? body.key : null
}
