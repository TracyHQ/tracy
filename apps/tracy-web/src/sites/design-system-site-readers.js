/**
 * Where the site browser's Design system panel (`design-system.js`) reads the running site: whether the page
 * carries the slot's marker after a write (`seen`), the fonts a worn system needs replaced (`glyphReader`), the home
 * page its cards take their words from (`home`), and the page its preview popup frames (`preview.innerOf`).
 *
 * One address for all four, so they cannot disagree on which machine holds the site: its web container when it
 * lives on this host, its public address when it lives on another one (`siteReadOrigin`). Never `siteTarget`'s
 * remote name `<label>.<host>-sites.<domain>`: a two-level name the edge certificate does not cover, so every read
 * of a site on `fleet01` failed its TLS handshake there (measured 14/10/2026) and the panel saw no site.
 */
import { bornSiteAddress } from '../lib/site-address.js'
import { siteReadOrigin } from './resolver.js'

/** The bytes of a home page the Design system panel reads its words from (`wordsOf` reads the top). */
export const HOME_HTML_MAX = 1_500_000

/**
 * @param {{ config: any, fetchImpl?: typeof fetch }} deps
 */
export function designSystemSiteReaders({ config, fetchImpl = fetch }) {
  /** The address the site is served at, where a served page's links point. @param {any} site */
  const publicOf = (site) => site.address || bornSiteAddress(site.label, config)
  /** The address the site's pages are read at. @param {any} site */
  const readOrigin = (site) => siteReadOrigin(site, config, publicOf(site))
  return {
    readOrigin,
    publicOf,
    /** Whether the page the site serves now carries the slot's marker: the first load after the write. */
    seen: async (/** @type {any} */ site, /** @type {string} */ slotId) => {
      const res = await fetchImpl(readOrigin(site), { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) return null
      return (await res.text()).includes(`tracy-ds-slot: ${slotId}`)
    },
    /**
     * The site as a visitor reads it, for the fonts a worn system needs replaced (`design-system-glyphs.js`): its own
     * address and the Google Fonts sheets, nothing else (the same fence as Apply's `siteReader`, `app.js`).
     */
    glyphReader: async (/** @type {any} */ site) => {
      const base = new URL(readOrigin(site))
      const text = async (/** @type {string | URL} */ url, headers = {}) => {
        const u = new URL(url, base)
        if (u.origin !== base.origin && u.hostname !== 'fonts.googleapis.com')
          throw new Error(`not the site's address: ${u.origin}`)
        const res = await fetchImpl(u, { headers, redirect: 'manual', signal: AbortSignal.timeout(8_000) })
        if (!res.ok) throw new Error(`${u.href} answered ${res.status}`)
        return res.text()
      }
      return { base: base.href, text }
    },
    /**
     * The home page the site serves now, for the panel's cards (`…/design-system/words`): the same address `seen`
     * reads, under the same 10 s, and no more than a page's worth of bytes.
     */
    home: async (/** @type {any} */ site) => {
      const res = await fetchImpl(readOrigin(site), {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'text/html' }
      })
      if (!res.ok) return null
      const html = await res.text()
      return html.length > HOME_HTML_MAX ? html.slice(0, HOME_HTML_MAX) : html
    }
  }
}
