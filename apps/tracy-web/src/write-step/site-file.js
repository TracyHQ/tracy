// One file of a site, as a visitor reads it. Reads only, and only from the site's own address.

/**
 * Where a site is read and served (sites/design-system-site-readers.js), passed in by the caller so the write step does not
 * import the sites domain.
 * @typedef {{ readOrigin: (site: object) => string | URL, publicOf: (site: object) => string }} Readers
 */
const TIMEOUT_MS = 20_000
const MOST_BYTES = 5_000_000

/**
 * @param {{ siteOf: (siteKey: string) => Promise<object | null>, readers: Readers, fetchImpl?: typeof fetch }} deps
 * @returns {(input: { siteKey: string, file: string }) => Promise<Buffer | null>} null when the site does not answer with it
 */
export function siteFileReader({ siteOf, readers, fetchImpl = fetch }) {
  return async ({ siteKey, file }) => {
    const site = await siteOf(siteKey)
    if (!site) throw new Error(`no site ${siteKey}`)
    const origin = new URL(readers.readOrigin(site))
    const url = new URL(file.replace(/^\/+/, ''), origin)
    if (url.origin !== origin.origin) return null
    const ask = () => fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })
    // One more try on a dropped connection: a frame's line should not fail for a moment's network.
    const res = await ask().catch(ask)
    if (!res.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    return bytes.length && bytes.length <= MOST_BYTES ? bytes : null
  }
}
