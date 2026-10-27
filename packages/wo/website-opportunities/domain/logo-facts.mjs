// Facts a business states on its own logo ("EST. 2023", "Since 1998", "Family owned"), read from the text the logo
// vision call already reads (`place-logo.js` readsAs). Pure. Each fact keeps the logo's words as its quote and the
// logo picture as its source, so the About block can state it as the business's own words.
// 🔒 A PATTERN, NOT A GUESS: only these shapes become a fact; logo text that is only the name gives nothing.

const YEAR = '(1[89]\\d\\d|20\\d\\d)'
const PATTERNS = [
  // "EST. 2023", "Est 1998", "Established 1975", "Founded in 2001", "Since 1998"
  new RegExp(`\\b(?:est(?:\\.|ablished)?|founded(?:\\s+in)?|since)\\s*\\.?\\s*${YEAR}\\b`, 'iu'),
  /\bfamily[\s-]+(?:owned|run)(?:\s+(?:and|&)\s+operated)?\b/iu
]

/**
 * @param {{readsAs?: string | null, mediaId?: string | null}} logo the chosen logo's reading
 * @param {number} [now] the year after which a year is no founding year (a typo or a phone number piece)
 * @returns {{text: string, quote: string, source: {kind: 'logo', mediaId: string | null}}[]}
 */
export function logoFactsOf(logo, now = new Date().getUTCFullYear()) {
  const text = typeof logo?.readsAs === 'string' ? logo.readsAs.replace(/\s+/g, ' ').trim() : ''
  if (!text) return []
  const out = []
  for (const re of PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    if (m[1] && Number(m[1]) > now) continue
    out.push({ text: m[0], quote: m[0], source: { kind: 'logo', mediaId: logo.mediaId ?? null } })
  }
  return out
}
