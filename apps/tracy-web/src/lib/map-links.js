// Shared: the write step and the site check both read a maps link, so it is in lib/. A link to a maps service and the address it
// searches, read from its address alone. The host reads maps the same way on the page (tracy-host demo-qa-page-measures.js
// `MAPS_URL`, `addressIn`), so a link here and a map there name one address alike.

/** A link that opens a maps service. */
export const MAPS_URL =
  /(?:google\.[a-z.]+\/maps|maps\.google\.|openstreetmap\.org|maps\.apple\.com|bing\.com\/maps)/i

/** The address a maps link searches (`q` or `query`), in lowercase words; null for coordinates or none. */
export function mapsAddress(href) {
  if (!MAPS_URL.test(String(href ?? ''))) return null
  try {
    const params = new URL(String(href), 'https://site.invalid').searchParams
    const q = params.get('q') ?? params.get('query')
    if (!q || /^\s*-?\d{1,3}\.\d+\s*,/.test(q)) return null
    return addressWords(q)
  } catch {
    return null
  }
}

/** An address as words, so two spellings of one address compare equal. */
export const addressWords = (text) =>
  String(text ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
