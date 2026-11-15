// The markers of the release gate's marker test (ticket #585, ADR 0045 decision 3). Every value the marker build
// writes carries a code of three capital letters, so anything a page shows can be traced back to the one field, fact
// or SEO value that wrote it, and anything a page shows WITHOUT a code is a leak.
//
// A marker uses letters, digits, spaces, a hyphen, a dot, a slash, a colon and an at sign only: no bracket, no quote,
// no ampersand and no angle bracket, so it passes the plugin's content checks, the JA ACM code notation (`((...))`),
// HTML piece functions and URL encoding unchanged. The shortest text marker is five characters (`Qx` and the code),
// which fits the shortest text limit a kit declares (the contract check requires a limit on every text field).
// Pure.

const LETTERS = 26
/** How many distinct codes three letters give. */
export const CODE_SPACE = LETTERS ** 3
/** The prefix of a text marker. Case does not matter when a page is read (templates change case with CSS). */
export const TEXT_PREFIX = 'Qx'
/** The prefix of an emphasis part (the words of a heading the template draws in its accent span). */
export const EMPHASIS_PREFIX = 'Qy'
/** The shortest text marker. */
export const TEXT_MARKER_LENGTH = TEXT_PREFIX.length + 3
/** The host every marker link and email uses: reserved for documentation, never a real site (RFC 2606). */
export const MARKER_HOST_SUFFIX = 'example'

/** The code of number `n` (0 based): three capital letters, `AAA` for 0. */
export function codeOf(n) {
  if (!Number.isInteger(n) || n < 0 || n >= CODE_SPACE) throw new RangeError(`no marker code for ${n}`)
  return [LETTERS ** 2, LETTERS, 1]
    .map((d) => String.fromCharCode(65 + (Math.floor(n / d) % LETTERS)))
    .join('')
}

/** The number of a code (the inverse of `codeOf`), or null. */
export function numberOf(code) {
  if (!/^[A-Z]{3}$/i.test(String(code ?? ''))) return null
  return [...String(code).toUpperCase()].reduce((n, c) => n * LETTERS + (c.charCodeAt(0) - 65), 0)
}

/** A text marker: the prefix and the code, padded with spaced filler words up to `length` when one is given. */
export function textMarker(code, { length, prefix = TEXT_PREFIX } = {}) {
  const head = `${prefix}${code}`
  if (!length || length <= head.length) return head
  let out = head
  while (out.length < length) out += out.length + 6 <= length ? ' qqqqq' : ' q'.slice(0, length - out.length)
  return out.slice(0, length).trimEnd()
}

/** A marker link on a documentation host: `https://qxabc.example/`. */
export const linkMarker = (code) => `https://qx${code.toLowerCase()}.${MARKER_HOST_SUFFIX}/`
/** A marker email address. */
export const emailMarker = (code) => `qx${code.toLowerCase()}@qx${code.toLowerCase()}.${MARKER_HOST_SUFFIX}`

/** A marker phone number: a fictional 555 number whose last five digits are the code's number. */
export function phoneMarker(code) {
  const n = String(numberOf(code)).padStart(5, '0')
  return `+1 555 01${n.slice(0, 2)} ${n.slice(2)}`
}

/** A marker link on a social network's own host, so the build recognises the network: the path carries the code. */
export const socialMarker = (host, code) => `https://${host}/qx${code.toLowerCase()}`

/** The file name of a marker picture. */
export const pictureMarker = (code, { theme, ext = 'png' } = {}) =>
  `qx${code.toLowerCase()}${theme ? `-${theme}` : ''}.${ext}`

const TEXT_RE = /\bq[xy]([a-z]{3})\b/gi
const LINK_RE = /qx([a-z]{3})(?:[.@/-]|$)/gi
const PHONE_RE = /\+?1[\s.-]*555[\s.-]*01(\d)(\d)[\s.-]*(\d)(\d)(\d)/g

/** The code of a phone marker match, or null (a number past the code space). */
const phoneCode = (m) => {
  const n = Number(m.slice(1, 6).join(''))
  return n < CODE_SPACE ? codeOf(n) : null
}

/**
 * Every marker code a text holds, upper case, each once (text, link, email and phone markers). With `known` (the codes
 * the build registered), only those: a number or a word that merely looks like a marker is no marker.
 * @param {string} text
 * @param {Set<string>} [known]
 */
export function codesIn(text, known) {
  const s = String(text ?? '')
  const out = new Set()
  for (const m of s.matchAll(TEXT_RE)) out.add(m[1].toUpperCase())
  for (const m of s.matchAll(LINK_RE)) out.add(m[1].toUpperCase())
  for (const m of s.matchAll(PHONE_RE)) {
    const code = phoneCode(m)
    if (code) out.add(code)
  }
  return [...out].filter((c) => !known || known.has(c))
}

/** The filler of a text marker (` qqqqq`), as a word. */
const FILLER_RE = /\bq{5}\b/gi

/**
 * What a text is, read for markers: `marker` when nothing but markers, their filler and separators is left once the
 * markers are taken out; `mixed` when markers sit beside other words; `filler` when it holds the marker filler and
 * nothing else (the gate's own search words a search page echoes); `none` when it holds no marker, its `rest` the
 * text without any filler.
 */
export function markerShare(text, { known } = {}) {
  const s = String(text ?? '')
  if (!codesIn(s, known).length) {
    if (!/\bq{5}\b/i.test(s)) return { kind: 'none', rest: s.trim() }
    const rest = s.replace(FILLER_RE, ' ').replace(/\s+/g, ' ').trim()
    return /[\p{L}\p{N}]/u.test(rest) ? { kind: 'none', rest } : { kind: 'filler', rest: '' }
  }
  // Only the registered markers are taken out: a look-alike beside them stays in the rest.
  const own = (code) => !known || known.has(String(code).toUpperCase())
  const rest = s
    .replace(PHONE_RE, (...m) => (own(phoneCode(m) ?? '') ? ' ' : m[0]))
    .replace(/(?:https?:\/\/)?(?:[\w-]+\.)*qx([a-z]{3})(?:[\w./@-]*)/gi, (all, code) =>
      own(code) ? ' ' : all
    )
    .replace(TEXT_RE, (all, code) => (own(code) ? ' ' : all))
    .replace(/\bq{1,5}\b/gi, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim()
  return { kind: rest ? 'mixed' : 'marker', rest }
}

/** Whether a text holds a code at all. */
export const hasMarker = (text) => codesIn(text).length > 0
