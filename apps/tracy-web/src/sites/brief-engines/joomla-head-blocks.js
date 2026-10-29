/**
 * The marked head blocks of a Joomla brief build (spec TracyHQ/tracy#189, item 28): the brand colours and the leftover
 * rules, each packed into blocks of its own that a site stores whole.
 *
 * 🔒 ONE WRITE NEVER TAKES AN UNRELATED PART DOWN. The brand colours and the leftover rules used to travel in one module;
 * when the leftover rules and the colours grew past what Joomla stores in one module, the whole write was refused and the
 * colours went with the leftovers. Now the colours have their own block(s) and the leftovers theirs, written apart, so a
 * refusal of one leaves the other on the page.
 * 🔒 BOUNDED, NEVER DROPPED. Joomla refuses a module whose content (or params) is longer than 65535 bytes
 * (`Joomla\CMS\Table\Module::check`, error `COM_MODULES_FIELD_CONTENT_TOO_LARGE`). The CSS is first packed (a rule that
 * comes again later is kept once, at its last place, which leaves the cascade as it was: a T4 site serves one compiled
 * bundle per page, so a template rule read from several bundles came out several times; neighbouring rules with the same
 * declarations share one selector list), then cut at rule boundaries into as many marked blocks as it takes, a selector
 * list longer than one block cut into several rules. No rule is left out; a block the site still refuses is reported with
 * its size.
 */
import { HEAD_BLOCK_END, HEAD_BLOCK_START } from 'website-opportunities/domain/outside-map.mjs'

/** The most bytes Joomla stores in one module's content (`Table\Module::check`). */
export const HEAD_BLOCK_LIMIT = 65535
/** The note of the leftovers module (the first part keeps the note earlier builds wrote). */
export const LEFTOVERS_NOTE = 'tracy-leftovers'
/** The note of the brand colours module. */
export const COLOURS_NOTE = 'tracy-brand-colours'
/** Every note a Tracy head block module carries (`tracy-leftovers`, `tracy-leftovers-2`, `tracy-brand-colours`...). */
export const TRACY_HEAD_NOTE = /^tracy-(?:leftovers|brand-colours)(?:-\d+)?$/

const bytes = (/** @type {string} */ s) => Buffer.byteLength(s, 'utf8')

/**
 * The top-level rules of a stylesheet, each with its own comments in front, in order. Braces inside strings and comments
 * are not counted.
 * @param {string} css
 * @returns {string[]}
 */
export function cssRules(css) {
  const out = []
  const text = String(css ?? '')
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 1
    } else if (c === '"' || c === "'") {
      for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1
    } else if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) {
        const rule = text.slice(start, i + 1).trim()
        if (rule) out.push(rule)
        start = i + 1
      }
    }
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out
}

/** The prelude and body of a plain rule (no at-rule, no nesting), or null. */
function plainRule(/** @type {string} */ rule) {
  const open = rule.indexOf('{')
  if (open < 0 || !rule.endsWith('}')) return null
  const prelude = rule.slice(0, open)
  const body = rule.slice(open + 1, -1)
  if (
    prelude
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .startsWith('@') ||
    body.includes('{')
  )
    return null
  return { prelude, body }
}

/** The selectors of a selector list, split at commas outside brackets, parentheses, strings and comments. */
function selectorsOf(/** @type {string} */ prelude) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < prelude.length; i += 1) {
    const c = prelude[i]
    if (c === '/' && prelude[i + 1] === '*') {
      const end = prelude.indexOf('*/', i + 2)
      i = end < 0 ? prelude.length : end + 1
    } else if (c === '"' || c === "'") {
      for (i += 1; i < prelude.length && prelude[i] !== c; i += 1) if (prelude[i] === '\\') i += 1
    } else if (c === '(' || c === '[') depth += 1
    else if (c === ')' || c === ']') depth -= 1
    else if (c === ',' && depth === 0) {
      out.push(prelude.slice(start, i))
      start = i + 1
    }
  }
  out.push(prelude.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

/**
 * The CSS packed: a rule that comes again later is kept once, at its LAST place (the cascade is unchanged: the later copy
 * already won over everything between), and neighbouring plain rules with the same declarations share one selector list.
 * @param {string} css
 * @returns {string[]} the packed rules, in order
 */
export function packCss(css) {
  const rules = cssRules(css)
  const last = new Map(rules.map((rule, at) => [rule, at]))
  const kept = rules.filter((rule, at) => last.get(rule) === at)
  const out = []
  let prev = null
  for (const rule of kept) {
    const plain = plainRule(rule)
    if (plain && prev && prev.body === plain.body) {
      prev.prelude = `${prev.prelude.trimEnd()},\n${plain.prelude.trim()}`
      out[out.length - 1] = `${prev.prelude}{${prev.body}}`
      continue
    }
    out.push(rule)
    prev = plain ? { ...plain } : null
  }
  return out
}

/**
 * A rule that is longer than `room` alone, cut into rules of the same declarations over parts of its selector list. An
 * at-rule, or one selector longer than `room`, stays whole (and is reported when the site refuses it).
 */
function cutRule(/** @type {string} */ rule, /** @type {number} */ room) {
  if (bytes(rule) <= room) return [rule]
  const plain = plainRule(rule)
  if (!plain) return [rule]
  const out = []
  let list = []
  const tail = bytes(`{${plain.body}}`)
  for (const selector of selectorsOf(plain.prelude)) {
    const next = [...list, selector]
    if (list.length && bytes(next.join(',\n')) + tail > room) {
      out.push(`${list.join(',\n')}{${plain.body}}`)
      list = [selector]
    } else list = next
  }
  if (list.length) out.push(`${list.join(',\n')}{${plain.body}}`)
  return out
}

/** One marked block around a `<style>` with the attribute `attr`. */
export const markedBlock = (/** @type {string} */ attr, /** @type {string} */ css) =>
  `${HEAD_BLOCK_START}<style ${attr}>\n${css}\n</style>${HEAD_BLOCK_END}`

/**
 * The CSS cut into marked blocks of at most `limit` bytes each, every rule in one of them, in order.
 * @param {string} css
 * @param {{attr: string, note: string, title: string, limit?: number}} kind
 * @returns {Array<{note: string, title: string, content: string}>}
 */
export function blocksOf(css, { attr, note, title, limit = HEAD_BLOCK_LIMIT }) {
  const room = limit - bytes(markedBlock(attr, ''))
  const rules = packCss(css).flatMap((rule) => cutRule(rule, room))
  if (!rules.length) return []
  const parts = []
  let part = []
  let size = 0
  for (const rule of rules) {
    const add = bytes(rule) + (part.length ? 1 : 0)
    if (part.length && size + add > room) {
      parts.push(part)
      part = []
      size = 0
    }
    part.push(rule)
    size += bytes(rule) + (part.length > 1 ? 1 : 0)
  }
  if (part.length) parts.push(part)
  return parts.map((p, at) => ({
    note: at === 0 ? note : `${note}-${at + 1}`,
    title: at === 0 ? title : `${title} ${at + 1}`,
    content: markedBlock(attr, p.join('\n'))
  }))
}

/** The CSS inside a block `leftoverHeadBlock` made, or ''. */
export function leftoverCss(/** @type {string} */ block) {
  const m = /<style data-tracy-leftovers>\n?([\s\S]*?)\n?<\/style>/.exec(String(block ?? ''))
  return m ? m[1] : ''
}

/**
 * The head blocks of a build: the leftover rules first, then the brand colours, each in blocks of its own.
 * @param {{leftovers?: string, colours?: string, limit?: number}} input - `leftovers`: `leftoverHeadBlock`'s answer;
 *   `colours`: `brandColoursCss`'s answer
 * @returns {Array<{note: string, title: string, content: string, part: 'leftovers' | 'colours'}>}
 */
export function headBlocks({ leftovers = '', colours = '', limit = HEAD_BLOCK_LIMIT }) {
  return [
    ...blocksOf(leftoverCss(leftovers), {
      attr: 'data-tracy-leftovers',
      note: LEFTOVERS_NOTE,
      title: 'Tracy leftovers',
      limit
    }).map((b) => ({ ...b, part: /** @type {const} */ ('leftovers') })),
    ...blocksOf(colours, {
      attr: 'data-tracy-brand-colours',
      note: COLOURS_NOTE,
      title: 'Tracy brand colours',
      limit
    }).map((b) => ({ ...b, part: /** @type {const} */ ('colours') }))
  ]
}

/** A head-code value with every Tracy block taken out; every other byte is kept. */
export function withoutTracyBlocks(/** @type {string} */ value) {
  let out = String(value ?? '')
  for (;;) {
    const start = out.indexOf(HEAD_BLOCK_START)
    const end = out.indexOf(HEAD_BLOCK_END, start)
    if (start < 0 || end < 0) return out.trim()
    out = `${out.slice(0, start)}${out.slice(end + HEAD_BLOCK_END.length)}`
  }
}

/** The size of a block in bytes, for the notes. */
export const blockBytes = bytes
