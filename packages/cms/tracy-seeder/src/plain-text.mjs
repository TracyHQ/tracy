/**
 * Text as a visitor reads it, for the WordPress contract: the Claude Cowork plugin takes plain text and escapes it
 * itself, so an HTML entity sent along is escaped a second time and shows on the page.
 *
 * 🔒 Measured 08/10/2026 on tamq-7q-bizwp4 (tracy-business/wp7 1.3.4): the contract sample
 * "ISO 9001 &amp; ISO 45001 certified" taught the model to write "Bánh sourdough &amp; bánh Việt", and the home
 * page showed the "&amp;". On the
 * same site the model answered the word "null" for the opening hours nobody gave, and the footer printed "null".
 */

/** The named entities a sample or a model answer carries in practice. */
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * The text with its HTML entities decoded once (`&amp;` → `&`, `&#38;` → `&`); an unknown name is left as written.
 * @param {string} text
 */
export function plainText(text) {
  return String(text).replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, name) => {
    const code = dec ? Number(dec) : hex ? Number.parseInt(hex, 16) : null
    if (code !== null) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    return NAMED[String(name).toLowerCase()] ?? whole
  })
}

/**
 * Whether a model's answer is a programming word for "nothing" rather than words for the page.
 * @param {unknown} value
 */
export const isNoValue = (value) => typeof value === 'string' && /^(?:null|undefined)$/i.test(value.trim())
