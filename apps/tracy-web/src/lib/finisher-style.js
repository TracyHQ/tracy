// The finisher's style block (ADR 0044, decision 30): the second bounded CSS exception, shared by the finisher's style order,
// the look guard and anyone who reads a head injection block (the Tracy site agent through content.get). A "style one block"
// repair is one rule, keyed by the kit block it styles, between its own markers in the kit's head injection block. Each rule
// sits on its own line behind a comment naming its block, so one rule is read, replaced or taken off alone, and a person
// reading the module sees what added it. The rule is scoped to the block's own element by its module id, never to the
// words it holds, so a later edit of the block's content leaves it in place.
//
// Only a closed list of properties may be ordered (text colour, a backing layer behind text, text shadow, font size, line
// height, spacing, wrapping of long words), and any declaration that makes content disappear is refused by name: display
// none, visibility hidden, zero opacity, zero height or max-height, moving it off screen, transparent or unreadably small text.
// Hide is never CSS (decision 2) still holds: nothing here can take content off the page.

export const FINISHER_STYLE_START = '<!-- tracy-finisher-style:start -->'
export const FINISHER_STYLE_END = '<!-- tracy-finisher-style:end -->'

const RULE_LINE = /^\/\* tracy-finisher (block-\d+): [^*]* \*\/ (.+)$/
const BLOCK_ID = /^block-(\d+)$/
// A target inside the block: tags, classes and ids, nested or as a direct child. No comma, no attribute, no pseudo class, so a
// target cannot reach outside the block's element nor close the rule.
const TARGET = /^[a-zA-Z][\w-]*(?:[.#][\w-]+)*$|^[.#][\w-]+(?:[.#][\w-]+)*$/
const MAX_TARGET_CHARS = 100
const MAX_DECLARATIONS = 8
const MAX_VALUE_CHARS = 120
// Plain value characters only: no semicolon, brace, angle bracket, quote, colon, bang, backslash or at sign.
const SAFE_VALUE = /^[\w\s#%.,()+/-]+$/

/** What each allowed property is for, as the fixer is told it. */
export const ALLOWED_PROPERTIES = Object.freeze({
  color: 'text colour',
  'background-color': 'a backing layer behind text',
  background: 'a backing layer behind text (a colour or a gradient, never a picture)',
  'text-shadow': 'text shadow',
  'font-size': 'font size',
  'line-height': 'line height',
  'letter-spacing': 'spacing',
  'word-spacing': 'spacing',
  padding: 'spacing',
  'padding-top': 'spacing',
  'padding-right': 'spacing',
  'padding-bottom': 'spacing',
  'padding-left': 'spacing',
  margin: 'spacing (never negative)',
  'margin-top': 'spacing (never negative)',
  'margin-right': 'spacing (never negative)',
  'margin-bottom': 'spacing (never negative)',
  'margin-left': 'spacing (never negative)',
  'overflow-wrap': 'wrapping of long words',
  'word-break': 'wrapping of long words',
  hyphens: 'wrapping of long words',
  'white-space': 'wrapping (normal, pre-line, pre-wrap or break-spaces)'
})

/** Properties that only ever hide, move off screen or clip content: refused by name, whatever the value. */
const HIDING_PROPERTIES = new Set([
  'display',
  'visibility',
  'opacity',
  'height',
  'max-height',
  'max-width',
  'width',
  'position',
  'transform',
  'translate',
  'left',
  'right',
  'top',
  'bottom',
  'inset',
  'text-indent',
  'clip',
  'clip-path',
  'overflow',
  'font',
  'content',
  'z-index',
  'filter',
  'mask'
])

const number = (value) => Number.parseFloat(value)
const lengthOf = (value) => /^(-?\d*\.?\d+)(px|rem|em|%)?$/.exec(value.trim())

/** A colour that draws nothing: transparent, or an alpha of zero. */
function isInvisibleColour(value) {
  const v = value.trim().toLowerCase()
  if (v === 'transparent') return true
  if (/^#(?:[0-9a-f]{3}0|[0-9a-f]{6}00)$/.test(v)) return true
  const alpha = /^(?:rgba?|hsla?)\((.+)\)$/
    .exec(v)?.[1]
    ?.split(/[\s,/]+/)
    ?.filter(Boolean)?.[3]
  return alpha !== undefined && number(alpha) <= 0.05
}

/** A font size too small to read: under 10 px, 0.6 em or rem, 60 per cent. A size code cannot evaluate is refused. */
function fontSizeRefusal(value) {
  const m = lengthOf(value)
  if (!m)
    return /^(?:small|medium|large|x-large|xx-large|larger)$/.test(value.trim())
      ? null
      : 'a font size is a length in px, em, rem or %'
  const n = number(m[1])
  const floor = { px: 10, em: 0.6, rem: 0.6, '%': 60 }[m[2] ?? 'px']
  return m[2] === undefined && n !== 0
    ? 'a font size names its unit'
    : n < floor
      ? 'makes the text too small to read'
      : null
}

function lineHeightRefusal(value) {
  if (value.trim() === 'normal') return null
  const m = lengthOf(value)
  if (!m) return 'a line height is a number or a length'
  const n = number(m[1])
  const floor = { px: 10, em: 0.8, rem: 0.8, '%': 80 }[m[2]] ?? 0.8
  return n < floor ? 'squeezes the lines into each other' : null
}

/** Why one declaration is refused, or null when it may be written. */
export function declarationRefusal(property, value) {
  const prop = String(property ?? '')
    .trim()
    .toLowerCase()
  const said = `${prop}: ${value}`
  if (typeof value !== 'string' || !value.trim()) return `${said}: a declaration needs a value`
  if (value.length > MAX_VALUE_CHARS || !SAFE_VALUE.test(value))
    return `${said}: the value holds characters a style value may not`
  if (/\b(?:url|expression|image|image-set|element|var|env|attr)\s*\(/i.test(value))
    return `${said}: a value never loads a picture or reads another value`
  if (/!\s*important/i.test(value)) return `${said}: the finisher adds the priority itself`
  if (HIDING_PROPERTIES.has(prop))
    return `${said}: may make content disappear (hidden, zero size or off screen)`
  if (!ALLOWED_PROPERTIES[prop]) return `${said}: ${prop} is not on the style allow list`
  if (prop === 'color' && isInvisibleColour(value)) return `${said}: makes the text disappear`
  if (prop === 'font-size') {
    const why = fontSizeRefusal(value)
    if (why) return `${said}: ${why}`
  }
  if (prop === 'line-height') {
    const why = lineHeightRefusal(value)
    if (why) return `${said}: ${why}`
  }
  if (prop.startsWith('margin') && /(^|[\s(])-\s*\d/.test(value))
    return `${said}: a negative margin may move content off screen`
  if (prop === 'white-space' && !/^(?:normal|pre-line|pre-wrap|break-spaces)$/.test(value.trim()))
    return `${said}: only wrapping white space is allowed`
  return null
}

/**
 * The scopes of a kit block's element on the page: T4 wraps a module in `#Mod<N>`, and an ACM block printed without that
 * wrapper carries `#acm-<name>-<N>` (template-kit find-blocks.js). Another wrapper is not reached, so the rule draws nothing.
 */
export function blockScopes(block) {
  const id = BLOCK_ID.exec(String(block ?? ''))?.[1]
  return id ? [`#Mod${id}`, `[id^="acm-"][id$="-${id}"]`] : null
}

/**
 * The style order's declarations held to the allow list, as the rule line it writes, or every refusal.
 * @param {{ block: string, target?: string | null, styles: Record<string, string> }} order
 * @returns {{ ok: true, line: string } | { ok: false, refusals: string[] }}
 */
export function styleRule({ block, target = null, styles }) {
  const scopes = blockScopes(block)
  if (!scopes) return { ok: false, refusals: [`${JSON.stringify(block ?? null)} is not a block id`] }
  const refusals = []
  const aim = target === null || target === undefined ? '' : String(target).trim()
  if (aim && (aim.length > MAX_TARGET_CHARS || !aim.split(/\s*>\s*|\s+/).every((p) => TARGET.test(p))))
    refusals.push(
      `target ${JSON.stringify(target)}: a target is tags, classes or ids inside the block, nothing else`
    )
  const entries = styles && typeof styles === 'object' && !Array.isArray(styles) ? Object.entries(styles) : []
  if (!entries.length) refusals.push('the order carries no declaration')
  if (entries.length > MAX_DECLARATIONS)
    refusals.push(`the order carries ${entries.length} declarations, over ${MAX_DECLARATIONS}`)
  for (const [prop, value] of entries) {
    const why = declarationRefusal(prop, value)
    if (why) refusals.push(why)
  }
  if (refusals.length) return { ok: false, refusals }
  const selector = scopes.map((s) => (aim ? `${s} ${aim.replace(/\s+/g, ' ')}` : s)).join(',')
  const body = entries
    .map(([p, v]) => [p.trim().toLowerCase(), v.trim().replace(/\s+/g, ' ')])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, v]) => `${p}:${v}!important`)
    .join(';')
  return {
    ok: true,
    line: `/* tracy-finisher ${block}: a repair of this block, delete this line to take it off */ ${selector}{${body}}`
  }
}

/** The finisher's rules a module's content holds, by block, in the order they stand. */
export function finisherRulesIn(content) {
  const text = String(content ?? '')
  const from = text.indexOf(FINISHER_STYLE_START)
  const to = text.indexOf(FINISHER_STYLE_END)
  const rules = new Map()
  if (from === -1 || to < from) return rules
  const inside = text
    .slice(from + FINISHER_STYLE_START.length, to)
    .replace(/^\s*<style>/, '')
    .replace(/<\/style>\s*$/, '')
  for (const line of inside.split('\n')) {
    const m = RULE_LINE.exec(line.trim())
    if (m) rules.set(m[1], line.trim())
  }
  return rules
}

/** The marked block a module's content holds, or null. */
export function finisherBlockIn(content) {
  const text = String(content ?? '')
  const from = text.indexOf(FINISHER_STYLE_START)
  const to = text.indexOf(FINISHER_STYLE_END)
  return from !== -1 && to > from ? text.slice(from, to + FINISHER_STYLE_END.length) : null
}

/** The marked block for these rules, or null when there is none. */
export const finisherBlockFor = (rules) =>
  rules.size
    ? `${FINISHER_STYLE_START}<style>\n${[...rules.values()].join('\n')}\n</style>${FINISHER_STYLE_END}`
    : null

/** `content` with the marked block put in place of an earlier one, added at the end, or taken off when `block` is null. */
export function withFinisherBlock(content, block) {
  const text = String(content ?? '')
  const held = finisherBlockIn(text)
  if (held) {
    const at = text.indexOf(held)
    const before = text.slice(0, at)
    const after = text.slice(at + held.length)
    if (block) return before + block + after
    return (before.replace(/\n$/, '') + after.replace(/^\n/, '')).replace(/^\n+|\n+$/g, '')
  }
  if (!block) return text
  return text === '' ? block : `${text}\n${block}`
}

/** `content` with one block's rule set to `line`, or taken off when `line` is null; every other rule stays as it was. */
export function withFinisherRule(content, block, line) {
  const rules = finisherRulesIn(content)
  if (line) rules.set(block, line)
  else rules.delete(block)
  return withFinisherBlock(content, finisherBlockFor(rules))
}

/**
 * Whether a marked block holds only finisher rules, each one the allow list would write for its block (the look guard's
 * `finisher-style`): its selector is the block's own scopes, and every declaration passes.
 */
export function isFinisherStyleBlock(block) {
  const rules = finisherRulesIn(block)
  if (finisherBlockFor(rules) !== block) return false
  for (const [id, line] of rules) {
    const css = RULE_LINE.exec(line)?.[2] ?? ''
    const m = /^([^{}]+)\{([^{}]*)\}$/.exec(css)
    if (!m) return false
    const scopes = blockScopes(id)
    const first = m[1].split(',')[0]
    const target = first.startsWith(scopes[0]) ? first.slice(scopes[0].length).trim() : null
    const styles = Object.fromEntries(
      m[2].split(';').map((d) => {
        const at = d.indexOf(':')
        return [d.slice(0, at), d.slice(at + 1).replace(/!important$/, '')]
      })
    )
    const again = styleRule({ block: id, target: target || null, styles })
    if (!again.ok || again.line !== line) return false
  }
  return true
}
