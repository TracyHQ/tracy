/**
 * The words a visitor reads in one Joomla row of a content contract's presentation lock: the text
 * pieces of an HTML column (`content`, `introtext`, `fulltext`) and the string fields of an ACM
 * block (`params` › `jatools-config`, JSON inside JSON), each with the `jsonPath` a contract slot
 * would name. Shared by ABOUT-1 and ABOUT-2, which both compare what a row says with the slots
 * Tracy may write.
 */

const ENTITIES = /** @type {Record<string, string>} */ ({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  divide: '÷',
  minus: '−',
  plusmn: '±',
  deg: '°',
  middot: '·',
  bull: '•',
  rarr: '→',
  larr: '←',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  le: '≤',
  ge: '≥',
  ne: '≠',
  asymp: '≈',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  shy: '',
  zwj: '',
  zwnj: ''
})

/** Decode the HTML entities a demo writes; an unknown one stays as written. */
export function decodeEntities(/** @type {string} */ text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#')
      return String.fromCodePoint(
        name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
      )
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/** One piece of text as a slot sample is compared: entities decoded, spaces collapsed. */
export const normalText = (/** @type {unknown} */ text) =>
  decodeEntities(String(text ?? ''))
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The text nodes of an HTML fragment, in order, each normalized; scripts, styles and comments out.
 * @param {unknown} html
 * @returns {string[]}
 */
export function htmlTextPieces(html) {
  return String(html ?? '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split(/<[^>]*>/)
    .map(normalText)
    .filter(Boolean)
}

/**
 * The first `<h1>` of an HTML fragment and the first paragraph after it, as text; null when the
 * fragment has no `<h1>`.
 * @param {unknown} html
 */
export function firstHeadingOf(html) {
  const source = String(html ?? '')
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(source)
  if (!h1) return null
  const after = source.slice(h1.index + h1[0].length)
  const p = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(after)
  return {
    heading: htmlTextPieces(h1[1]).join(' '),
    paragraph: p ? htmlTextPieces(p[1]).join(' ') : null
  }
}

/**
 * Every string field of an ACM block's configuration, with the path a contract slot names
 * (`["gallery", "basic[gallery_title]", 0]`).
 * @param {unknown} params the module's `params` column
 * @returns {{ path: (string | number)[], text: string }[]}
 */
export function acmStrings(params) {
  let config
  try {
    const outer = JSON.parse(String(params ?? '{}'))
    config = JSON.parse(String(outer?.['jatools-config'] ?? 'null'))
  } catch {
    return []
  }
  /** @type {{ path: (string | number)[], text: string }[]} */
  const out = []
  /** @param {unknown} value @param {(string | number)[]} path */
  const walk = (value, path) => {
    if (typeof value === 'string') out.push({ path, text: value })
    else if (Array.isArray(value)) value.forEach((v, k) => walk(v, [...path, k]))
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) if (!k.startsWith(':')) walk(v, [...path, k])
  }
  walk(config, [])
  return out
}

/** Whether two slot paths name the same field. */
export const samePath = (/** @type {unknown[]} */ a, /** @type {unknown[]} */ b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((v, k) => String(v) === String(b[k]))

/** Text a visitor reads as a sentence or a heading: letters and at least `min` characters once the
 * identity tokens (`{site.name}`, `{loadposition x}`) are taken out; no address or icon class. */
export function isProse(/** @type {string} */ text, min = 12) {
  // A plugin command with arguments (`{jamap mode='normal' …}`) is not words; STAB-2 reads those.
  if (/^\s*\{[a-z]+\s/i.test(text)) return false
  const words = text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (
    words.length >= min &&
    words.includes(' ') &&
    !/^[a-z-]+:\s*\S+;?$/.test(words) &&
    /\p{L}{3}/u.test(words) &&
    !/^(https?:|mailto:|tel:|\/|#|index\.php|images\/|<|\.|\{)/.test(words) &&
    !/^(fa|fas|far|fab|bi|icon)[ -]/.test(words)
  )
}

/** A CSS class a theme names in a field: a utility or component prefix and a hyphen (`btn-primary`). */
const CLASS_NAME =
  /^(btn|text|bg|border|col|row|d|m[tbsexy]?|p[tbsexy]?|fa[srbl]?|bi|icon|is|has|align|justify|flex|w|h|rounded|shadow|badge|alert|link|nav|card)-[a-z0-9-]+$/
/** Bootstrap's state classes, written beside a component class (`btn-secondary disabled`). */
const STATE_CLASS = /^(active|disabled|show|fade|collapsed|selected|hidden|visible)$/

/**
 * A value that is a list of CSS classes, not words: every token is a lower-case class name, and at
 * least one is a utility or component class (`btn-secondary disabled`, JA Symphony
 * `event[event-btn-1]`). "Book your seat" is never one: no token has a class prefix.
 */
const isClassList = (/** @type {string} */ text) => {
  const tokens = text.trim().split(/\s+/)
  return (
    tokens.some((t) => CLASS_NAME.test(t)) && tokens.every((t) => CLASS_NAME.test(t) || STATE_CLASS.test(t))
  )
}

/**
 * An ACM field that holds a setting, not words: by its name (`font-icon`, `bg-color`, `link`), or
 * by a value that is a list of CSS classes (a button style field such as `event-btn-1`).
 */
export const isSettingField = (/** @type {(string | number)[]} */ path, /** @type {string} */ text = '') =>
  /(icon|class|style|color|colour|url|link|target|layout|animation|align|size|video)/i.test(
    String([...path].reverse().find((p) => typeof p === 'string') ?? '')
  ) || isClassList(text)
