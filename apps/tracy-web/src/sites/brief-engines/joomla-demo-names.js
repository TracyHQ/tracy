/**
 * The demo company's name, renamed to the customer's inside the demo text a site keeps (TCH #1013, D9): a customer who gave a
 * name and left the description blank keeps the template's words, and those words named the template's company ("Northgate
 * delivers turnkey plants…"). The names come from the template's own declaration, `demoCompanyNames` in the copy file beside
 * its contract (`<version>.copy.json`, `lib/contract-copy.js`); a template that declares none renames nothing.
 *
 * 🔒 ONLY THE NAME AS A WORD, NEVER AN ADDRESS. A name is matched whole (no letter or digit on either side) and with the case
 * it is declared in; nothing inside markup, a URL, an email address, a file or domain name, a path or a `{token}` is touched:
 * `images/northgate/hero.png`, `hello@northgate.com` and `href="…"` stay as they are (K1: paths and files are the template's).
 */

/** What a piece of text holds that no rename may reach: markup, links, addresses, files, paths and site tokens. */
const PROTECTED = new RegExp(
  [
    '<[^>]*>',
    '\\b[a-z][a-z0-9+.-]*:\\/\\/[^\\s<>"\']*',
    '\\bmailto:[^\\s<>"\']*',
    '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+',
    '[^\\s<>"\']*\\/[^\\s<>"\']*',
    '\\b[\\w-]+(?:\\.[\\w-]+)*\\.[A-Za-z][A-Za-z0-9]{1,23}\\b',
    '\\{[\\w.-]+\\}'
  ].join('|'),
  'giu'
)

/** A line that is a file as a whole (`images/northgate/decks/Corporate Deck.pdf`): its spaces do not make it words. */
const FILE =
  /^(?:(?:images|media|files)\/.*|.*\.(?:pdf|png|jpe?g|gif|svg|webp|avif|zip|docx?|xlsx?|pptx?|mp4|mp3))$/i

/** A string as a literal in a regular expression. */
const escaped = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * `value` with every declared demo name, as a whole word and in its declared case, replaced by `replacement`, outside the
 * protected pieces. The longest name goes first, so "Northgate Industrial" is not left "<name> Industrial".
 * @param {string} value
 * @param {string[]} names - the template's `demoCompanyNames`
 * @param {string} replacement - the customer's name, or `{site.name}` on a site that fills it in
 * @returns {string}
 */
export function renameDemoCompany(value, names, replacement) {
  const wanted = [...new Set(names.filter((n) => typeof n === 'string' && n.trim().length >= 3))].sort(
    (a, b) => b.length - a.length
  )
  if (wanted.length === 0 || !replacement || FILE.test(value.trim())) return value
  const word = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${wanted.map(escaped).join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
  const rename = (/** @type {string} */ free) => free.replace(word, () => replacement)
  let out = ''
  let at = 0
  for (const match of value.matchAll(PROTECTED)) {
    out += rename(value.slice(at, match.index)) + match[0]
    at = (match.index ?? 0) + match[0].length
  }
  return out + rename(value.slice(at))
}

/** Words that make a sentence a fact about a business: when it began, how long, how many. */
const FACT_WORDS =
  /\b(?:since|founded|established|opened|est\.?|years?|decades?|first|award(?:ed|s)?|members?|clients?|customers?|projects?)\b/i
/** A year ("in 2008") or a tally ("500+", "100k", "98%"): a bare figure ("Phase 2") is a label, not a fact. */
const YEAR = /\b(?:1[89]|20)\d{2}\b/
const TALLY = /\d\s*(?:\+|k\b|%)/i
/** A credit line states a right, not a fact about the business: its year is the template's, renamed like any word. */
const CREDIT = /©|\bcopyright\b|all rights reserved/i

/**
 * Whether a sentence of `value` that names the demo company also states a fact: a figure or a word of founding, age or count.
 * @param {string} value
 * @param {string[]} names
 */
export function statesFact(value, names) {
  const wanted = names.filter((n) => typeof n === 'string' && n.trim().length >= 3)
  for (const sentence of value.split(/(?<=[.!?])\s+|\n+/)) {
    if (!wanted.some((n) => sentence.includes(n)) || CREDIT.test(sentence)) continue
    // A figure inside a name ("Harbour 2") is the name's, not a fact: the names are read out first, longest first.
    const rest = [...wanted]
      .sort((a, b) => b.length - a.length)
      .reduce((s, n) => s.split(n).join(' '), sentence)
    if (YEAR.test(rest) || TALLY.test(rest) || FACT_WORDS.test(rest)) return true
  }
  return false
}

/**
 * The contract writes that rename the demo company in the text slots `values` holds (a slot's key → the words it will hold).
 * A slot whose words would pass its length is left as it is.
 * @param {object} input
 * @param {Array<{ key: string, type: string, maxCharacters?: number }>} input.slots
 * @param {(slot: any) => string | null} input.valueOf - the words a slot will hold, or null for a slot this does not touch
 * @param {string[]} input.names
 * @param {string} input.replacement
 * @param {string[]} [input.factLines] - filled with the keys of the lines left unrenamed because they state a fact
 * @returns {Record<string, string>}
 */
export function demoNameChanges({ slots, valueOf, names, replacement, factLines = [] }) {
  /** @type {Record<string, string>} */
  const changes = {}
  if (names.length === 0 || !replacement) return changes
  for (const slot of slots) {
    if (slot.type !== 'text') continue
    const value = valueOf(slot)
    if (typeof value !== 'string' || value === '') continue
    const renamed = renameDemoCompany(value, names, replacement)
    if (renamed === value) continue
    // 🔒 A RENAME NEVER STATES A FACT UNDER THE OWNER'S NAME (spec TracyHQ/tracy#189): "We opened Studio X in 2008" renamed is a
    // founding year nobody gave. Such a line keeps the demo's words here, and the caller empties it (`factLines`).
    if (statesFact(value, names)) {
      factLines.push(slot.key)
      continue
    }
    if (typeof slot.maxCharacters === 'number' && [...renamed].length > slot.maxCharacters) continue
    changes[slot.key] = renamed
  }
  return changes
}
