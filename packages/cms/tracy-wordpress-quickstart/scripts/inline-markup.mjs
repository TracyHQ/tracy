/**
 * Inline markup of one WordPress text block, as the Claude Cowork plugin reads and writes it (TracyHQ/tracy#459).
 *
 * A slot with `markup: "inline"` holds the inner HTML of a block's element in the content map's notation:
 * `((tag attrs))words((/tag))` and `((br/))`, the notation the Joomla capture writes (`unit-markup.php`) and the
 * template kit reads. `notationOf` is the plugin's `InlineMarkup::notationOf`, so a sample is the value `inspect`
 * answers; `markupProblem` is the plugin's write check (`InlineMarkup::htmlOf`), so a slot is made only for a block
 * whose demo the plugin can write back. Keep the three in step: the plugin is the authority.
 */

/** The tags the plugin writes and the attributes each may keep (`InlineMarkup::ALLOWED`). */
export const ALLOWED = {
  span: ['class'],
  strong: [],
  em: [],
  b: [],
  i: [],
  br: [],
  a: ['href', 'class', 'target', 'rel'],
  sup: [],
  sub: []
}
const TARGETS = new Set(['_blank', '_self'])
const RELS = new Set(['noopener', 'noreferrer', 'nofollow', 'external', 'ugc', 'sponsored'])
const TOKEN = /\(\((\/?)([a-z][a-z0-9]*)((?:\s[^()]*)?\/?)\)\)/gi
const URL_OK = /^(https:\/\/\S+|mailto:\S+|tel:[+0-9 ()-]+|\/[a-zA-Z0-9/_?&=.%#-]*|#[a-zA-Z0-9_-]+)$/

// The named entities a demo text uses, decoded as PHP's html_entity_decode (ENT_HTML5) decodes them.
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  euro: '\u20ac'
}
const decode = (text) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/g, (whole, n) => ENTITIES[n] ?? whole)

/** The inner HTML of an element in the notation: words decoded and kept as they are, attributes in the order written. */
export function notationOf(html) {
  let out = ''
  let at = 0
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    out += decode(html.slice(at, m.index))
    at = m.index + m[0].length
    const name = m[2].toLowerCase()
    if (m[1] === '/') {
      out += `((/${name}))`
      continue
    }
    let attrs = ''
    for (const p of m[3].matchAll(/([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs += ` ${p[1].toLowerCase()}="${decode(p[2] ?? p[3] ?? '').replace(/"/g, '&quot;')}"`
    }
    out += name === 'br' || m[4] === '/' ? `((${name}${attrs}/))` : `((${name}${attrs}))`
  }
  return out + decode(html.slice(at))
}

/** The words of a value in the notation: what a slot's character limit counts. */
export const wordsOf = (value) => value.replace(TOKEN, '')

/**
 * Why the plugin would refuse to write `value` back, or null. Classes are not checked: the slot's own demo is its
 * class allowlist. Links follow the `url` slot rules a sealed profile can hold (an `http://` link is the site's own
 * host only, which a capture cannot know, so it is refused here).
 * @param {string} value @param {{ button?: boolean }} [options] a button's text sits inside its own link
 */
export function markupProblem(value, { button = false } = {}) {
  const open = []
  let at = 0
  for (const m of value.matchAll(TOKEN)) {
    const words = value.slice(at, m.index)
    if (words.includes('((') || words.includes('))')) return 'unreadable'
    at = m.index + m[0].length
    const name = m[2].toLowerCase()
    if (!(name in ALLOWED)) return `tag ${name}`
    if (m[1] === '/') {
      if (name === 'br' || open.pop() !== name) return 'unbalanced'
      continue
    }
    let attrs = m[3].trim()
    const isVoid = attrs.endsWith('/')
    attrs = attrs.replace(/\/$/, '').trim()
    if (isVoid && name !== 'br') return 'unreadable'
    if (name === 'a' && (button || open.includes('a'))) return 'link inside a link'
    if (attrs.replace(/\s*[a-zA-Z][a-zA-Z0-9_:.-]*="[^"]*"/g, '').trim() !== '') return 'unreadable'
    for (const p of attrs.matchAll(/([a-zA-Z][a-zA-Z0-9_:.-]*)="([^"]*)"/g)) {
      const attr = p[1].toLowerCase()
      const v = decode(p[2])
      if (!ALLOWED[name].includes(attr)) return `attribute ${attr} on ${name}`
      if (attr === 'href' && (!URL_OK.test(v) || v.startsWith('//') || v.includes('\\'))) return `link ${v}`
      if (attr === 'target' && !TARGETS.has(v)) return `target ${v}`
      if (
        attr === 'rel' &&
        v
          .trim()
          .split(/\s+/)
          .some((r) => !RELS.has(r))
      )
        return `rel ${v}`
    }
    if (name !== 'br') open.push(name)
  }
  const rest = value.slice(at)
  if (rest.includes('((') || rest.includes('))')) return 'unreadable'
  return open.length ? 'unbalanced' : null
}
