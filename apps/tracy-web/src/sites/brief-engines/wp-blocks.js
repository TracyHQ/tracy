/**
 * A WordPress body read as blocks, for the one job of taking parts OUT of it.
 *
 * 🔒 NOTHING HERE RE-SERIALISES. A body is HTML wrapped in block comments, and WordPress judges a block by
 * the bytes it finds: an attribute that moves, an entity that is spelt another way or a newline that goes
 * makes the editor call the block "modified" and the next save rewrites it. So a block is a RANGE of the
 * original string, an edit is "cut this range", and every byte that is not cut stays exactly as it was
 * read. A body that does not parse (an unclosed block, attributes that are not JSON) answers `null` and is
 * left alone: a page nobody can read is never edited.
 *
 * What it knows about a block: where it starts and ends, the name WordPress knows it by, the text a visitor
 * reads inside it (its "leaves"), and whether it is LIVE — printed by WordPress at the moment of the visit
 * (a menu, a query of posts, a form, the site title) or filled from the site's identity (`{contact.phone}`).
 * A live block is never cut: what it shows is not what was stored.
 */

/** A block comment: `<!-- wp:name {json} -->`, `<!-- wp:name /-->`, `<!-- /wp:name -->`. */
const DELIMITER = /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)(?:\s+(\{[\s\S]*?\}))?\s*(\/)?-->/g

/**
 * @typedef {object} Block
 * @property {string} name - `core/paragraph`, `wp-tracy-business/mega-menu`: always with its namespace.
 * @property {Record<string, any> | null} attrs
 * @property {number} start - where its opening comment starts.
 * @property {number} end - where its closing comment ends (the whole block is `[start, end)`).
 * @property {number} innerStart
 * @property {number} innerEnd
 * @property {boolean} selfClosing
 * @property {Block[]} children
 * @property {Block | null} parent
 */

/** The name a block comment spells without its namespace belongs to core. */
const qualify = (/** @type {string} */ name) => (name.includes('/') ? name : `core/${name}`)

/**
 * @param {string} markup
 * @returns {Block | null} a root whose children are the top-level blocks, or null when the body is not
 *   well-formed block markup.
 */
export function parseBlocks(markup) {
  /** @type {Block} */
  const root = {
    name: '#root',
    attrs: null,
    start: 0,
    end: markup.length,
    innerStart: 0,
    innerEnd: markup.length,
    selfClosing: false,
    children: [],
    parent: null
  }
  const stack = [root]
  for (const m of markup.matchAll(DELIMITER)) {
    const [whole, close, rawName, rawAttrs, self] = m
    const at = m.index ?? 0
    const name = qualify(rawName)
    const top = stack[stack.length - 1]
    if (close) {
      if (stack.length === 1 || top.name !== name) return null
      top.innerEnd = at
      top.end = at + whole.length
      stack.pop()
      continue
    }
    /** @type {Record<string, any> | null} */
    let attrs = null
    if (rawAttrs) {
      try {
        attrs = JSON.parse(rawAttrs)
      } catch {
        return null
      }
    }
    /** @type {Block} */
    const node = {
      name,
      attrs,
      start: at,
      end: at + whole.length,
      innerStart: at + whole.length,
      innerEnd: at + whole.length,
      selfClosing: Boolean(self),
      children: [],
      parent: top
    }
    top.children.push(node)
    if (!self) stack.push(node)
  }
  return stack.length === 1 ? root : null
}

/** The few named entities a body spells; every other `&…;` is left as it is. */
const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  middot: '·',
  bull: '•',
  laquo: '«',
  raquo: '»'
}

/**
 * What a visitor reads of a run of HTML text: entities decoded, runs of white space made one space.
 * @param {string} raw
 */
export function plain(raw) {
  return raw
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec))
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16))
      return NAMED[String(name).toLowerCase()] ?? whole
    })
    .replace(/[\s ]+/g, ' ')
    .trim()
}

/**
 * The text runs of an HTML string, outside tags, comments, scripts and styles.
 * @param {string} markup
 * @param {number} start
 * @param {number} end
 * @returns {Array<{ start: number, end: number, raw: string }>}
 */
function textRuns(markup, start, end) {
  /** @type {Array<{ start: number, end: number, raw: string }>} */
  const runs = []
  const html = markup.slice(start, end)
  const token = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>|<[^>]*>/gi
  let last = 0
  for (const m of html.matchAll(token)) {
    const at = m.index ?? 0
    if (at > last) runs.push({ start: start + last, end: start + at, raw: html.slice(last, at) })
    last = at + m[0].length
  }
  if (last < html.length) runs.push({ start: start + last, end: end, raw: html.slice(last) })
  return runs
}

/**
 * The stretches of a block's own HTML: its inside without its child blocks and without the comments
 * that open and close it.
 * @param {Block} node
 * @returns {Array<[number, number]>}
 */
function ownSpans(node) {
  /** @type {Array<[number, number]>} */
  const spans = []
  let at = node.innerStart
  for (const child of node.children) {
    if (child.start > at) spans.push([at, child.start])
    at = child.end
  }
  if (node.innerEnd > at) spans.push([at, node.innerEnd])
  return spans
}

/**
 * The text a visitor reads inside a block and everything under it, in order.
 * @param {string} markup
 * @param {Block} node
 * @returns {string[]}
 */
export function leavesOf(markup, node) {
  /** @type {string[]} */
  const leaves = []
  const walk = (/** @type {Block} */ at) => {
    // A block's own HTML and its children interleave in the document, so walk them in position order.
    const parts = [
      ...ownSpans(at).map((span) => ({ at: span[0], span })),
      ...at.children.map((child) => ({ at: child.start, child }))
    ].sort((a, b) => a.at - b.at)
    for (const part of parts) {
      if ('child' in part) walk(part.child)
      else
        for (const run of textRuns(markup, part.span[0], part.span[1])) {
          const text = plain(run.raw)
          if (text !== '') leaves.push(text)
        }
    }
  }
  walk(node)
  return leaves
}

/**
 * An identity token the plugin fills at the visit: `{site.name}`, `{contact.phone}`, `{social.facebook}`, and `{year}`.
 *
 * 🔒 `{YEAR}` IS ONE TOO (LANG-2, measured 10/10/2026 on dev g59-ess-wp-full, JA Essence WordPress 1.0.12): it has no dot, so a
 * rewritten copyright line that wrote "2026" in its place passed every token check and would have frozen the year.
 */
const TOKEN = /\{[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+\}|\{year\}|data-tracy-identity/

/** Blocks WordPress prints at the moment of the visit, whatever was stored. */
const LIVE = new RegExp(
  '^(?:core/(?:navigation(?:-link|-submenu)?|query(?:-.+)?|post-.+|site-.+|search|shortcode|template-part|' +
    'pattern|block|loginout|page-list(?:-item)?|latest-.+|archives|calendar|tag-cloud|rss|comments(?:-.+)?|' +
    'avatar|read-more|term-.+|home-link|social-links?)|polylang/.+|contact-form-7/.+|.+/.*form.*)$'
)

/** Every identity token in a text, in order (`{year}`, `{site.title}`): what a line that carries them must carry again. */
export const tokensOf = (/** @type {string} */ text) =>
  [...text.matchAll(new RegExp(TOKEN.source, 'g'))].map((m) => m[0])

/**
 * Whether WordPress prints a block of this name at the visit (a menu, a query, a form), whatever was stored: unlike
 * `hasLive`, an identity token in its stored words does not count.
 * @param {string | null} name
 */
export const isLiveBlock = (name) => LIVE.test(name ?? '')

/**
 * Whether a block is, or holds, something live: a menu, a query, a form, an identity token.
 * @param {string} markup
 * @param {Block} node
 */
export function hasLive(markup, node) {
  if (LIVE.test(node.name)) return true
  if (TOKEN.test(markup.slice(node.start, node.end))) return true
  return node.children.some((child) => hasLive(markup, child))
}

/**
 * `markup` without the given ranges. A range that leaves a blank line behind takes the blank line too, so
 * the body does not collect empty lines at every edit.
 * @param {string} markup
 * @param {Array<[number, number]>} ranges - non-overlapping
 */
export function cut(markup, ranges) {
  let out = markup
  for (const [start, end] of [...ranges].sort((a, b) => b[0] - a[0])) {
    let to = end
    while (
      to < out.length &&
      (out[to] === '\n' || out[to] === '\r') &&
      (start === 0 || out[start - 1] === '\n')
    )
      to += 1
    out = out.slice(0, start) + out.slice(to)
  }
  return out
}

/**
 * Every block at or under `root` whose `metadata.name` is `name`, in document order: the way the contract
 * names a block (`text.heading`), and the only way to say "the second one on this page".
 * @param {Block} root
 * @param {string} name
 * @returns {Block[]}
 */
export function namedBlocks(root, name) {
  /** @type {Block[]} */
  const out = []
  const walk = (/** @type {Block} */ node) => {
    if (node.attrs?.metadata?.name === name) out.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}

/** A value written into a block's comment the way WordPress writes one (`serialize_block_attributes`, `\"` as `\u0022`). */
export const commentJson = (/** @type {string} */ value) =>
  JSON.stringify(value)
    .replace(/--/g, '\\u002d\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\\"/g, '\\u0022')

/** A JSON string's text, or null when it is none. @param {string} body - between its quotes */
const jsonText = (body) => {
  try {
    return JSON.parse(`"${body}"`)
  } catch {
    return null
  }
}

/**
 * Where a block's comment holds `"<name>":"<value>"`, however it spells it: WordPress writes `\u0026`, `\u002d\u002d` and
 * `\u0022`, an older writer `\/`, a hand a space after the colon — so the member is found by what it SAYS, not by one
 * spelling of it. Null when the comment holds no such member.
 * @param {string} markup
 * @param {Block} node
 * @param {string} name
 * @param {string} value - as the attributes read it
 * @returns {{ start: number, end: number } | null}
 */
export function memberAt(markup, node, name, value) {
  const comment = markup.slice(node.start, node.selfClosing ? node.end : node.innerStart)
  for (const m of comment.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g))
    if (jsonText(m[1]) === name && jsonText(m[2]) === value)
      return { start: node.start + (m.index ?? 0), end: node.start + (m.index ?? 0) + m[0].length }
  return null
}

/**
 * The body with the one line of text inside a block replaced. A block with more than one text run (a paragraph
 * with a link in the middle of it) is not one line and answers null: nothing is guessed about where the new
 * words would go.
 * @param {string} markup
 * @param {Block} node
 * @param {string} text
 * @returns {string | null}
 */
export function withText(markup, node, text) {
  const runs = ownSpans(node)
    .flatMap(([from, to]) => textRuns(markup, from, to))
    .filter((run) => plain(run.raw) !== '')
  if (runs.length !== 1) return null
  const [run] = runs
  const lead = run.raw.length - run.raw.trimStart().length
  const trail = run.raw.length - run.raw.trimEnd().length
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return markup.slice(0, run.start + lead) + escaped + markup.slice(run.end - trail)
}

/**
 * The text runs of a raw HTML block (`core/html`), as a visitor reads them and where each stands in the body: outside tags,
 * comments, scripts and styles, with the white space around a run left out of its range. Nothing about a run says it is one
 * line; the caller decides which of them are sentences.
 * @param {string} markup
 * @param {Block} node
 * @returns {Array<{ start: number, end: number, text: string }>}
 */
export function htmlRuns(markup, node) {
  return ownSpans(node)
    .flatMap(([from, to]) => textRuns(markup, from, to))
    .map((run) => {
      const lead = run.raw.length - run.raw.trimStart().length
      const trail = run.raw.length - run.raw.trimEnd().length
      return { start: run.start + lead, end: run.end - trail, text: plain(run.raw) }
    })
    .filter((run) => run.text !== '')
}

/**
 * The one line of text a block holds, or null when it holds none or more than one (a paragraph with a link in the
 * middle of it is two runs and is nobody's single line).
 * @param {string} markup
 * @param {Block} node
 * @returns {string | null}
 */
export function singleLine(markup, node) {
  const runs = ownSpans(node)
    .flatMap(([from, to]) => textRuns(markup, from, to))
    .map((run) => plain(run.raw))
    .filter((text) => text !== '')
  return runs.length === 1 ? runs[0] : null
}
