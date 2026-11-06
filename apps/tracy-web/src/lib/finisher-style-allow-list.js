// The finisher's style allow list (ADR 0044, decision 30): the second bounded CSS exception. A "style one block" repair is
// one rule for one kit block, and code accepts only a closed list of properties (text colour, a backing layer behind text,
// text shadow, font size, line height, spacing, wrapping of long words). Anything that can take content off the page is
// refused: a property that hides, moves or clips (refused by name whatever its value, `opacity` included), a transparent or
// unreadably small text, a text colour too close to the backing colour the same rule sets, spacing past a sane maximum
// and negative letter or word spacing. Hide is never CSS (decision 2): nothing this list writes takes content off the page.
import { colourPairRefusal } from './finisher-style-colours.js'

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
  color: 'text colour (readable against the backing colour of the same rule)',
  'background-color': 'a backing layer behind text',
  background: 'a backing layer behind text (a colour or a gradient, never a picture)',
  'text-shadow': 'text shadow',
  'font-size': 'font size',
  'line-height': 'line height',
  'letter-spacing': 'spacing (never negative, at most 4em or 64px)',
  'word-spacing': 'spacing (never negative, at most 4em or 64px)',
  padding: 'spacing (at most 4em or 64px)',
  'padding-top': 'spacing (at most 4em or 64px)',
  'padding-right': 'spacing (at most 4em or 64px)',
  'padding-bottom': 'spacing (at most 4em or 64px)',
  'padding-left': 'spacing (at most 4em or 64px)',
  margin: 'spacing (never negative, at most 4em or 64px)',
  'margin-top': 'spacing (never negative, at most 4em or 64px)',
  'margin-right': 'spacing (never negative, at most 4em or 64px)',
  'margin-bottom': 'spacing (never negative, at most 4em or 64px)',
  'margin-left': 'spacing (never negative, at most 4em or 64px)',
  'overflow-wrap': 'wrapping of long words',
  'word-break': 'wrapping of long words',
  hyphens: 'wrapping of long words',
  'white-space': 'wrapping (normal, pre-line, pre-wrap or break-spaces)'
})

/** Properties that only ever hide, fade, move off screen or clip content: refused by name, whatever the value. */
const HIDING_PROPERTIES = new Set(
  'display visibility opacity height max-height max-width width position transform translate left right top bottom inset text-indent clip clip-path overflow font content z-index filter mask'.split(
    ' '
  )
)

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
  if (m[2] === undefined && n !== 0) return 'a font size names its unit'
  return n < floor ? 'makes the text too small to read' : null
}

function lineHeightRefusal(value) {
  if (value.trim() === 'normal') return null
  const m = lengthOf(value)
  if (!m) return 'a line height is a number or a length'
  const floor = { px: 10, em: 0.8, rem: 0.8, '%': 80 }[m[2]] ?? 0.8
  return number(m[1]) < floor ? 'squeezes the lines into each other' : null
}

/** The most a spacing may be, per unit: past it the block's words are pushed out of sight. */
const SPACING_MAX = { px: 64, em: 4, rem: 4, '%': 25 }

/** Spacing held to sane maxima; margins, letter and word spacing never negative. */
function spacingRefusal(prop, value) {
  const keywords = prop.startsWith('margin') ? ['auto', 'normal'] : ['normal']
  for (const part of value.trim().split(/\s+/)) {
    if (keywords.includes(part)) continue
    const m = lengthOf(part)
    if (!m) return 'a spacing is a length in px, em, rem or %'
    const n = number(m[1])
    if (n < 0) return 'a negative spacing may pull content over itself or off screen'
    if (m[2] === undefined && n !== 0) return 'a spacing names its unit'
    if (prop.endsWith('spacing') && m[2] === '%')
      return 'a letter or word spacing is a length in px, em or rem'
    const max = SPACING_MAX[m[2] ?? 'px']
    if (n > max)
      return `over the most a spacing may be (${max}${m[2] ?? 'px'}), it pushes content out of sight`
  }
  return null
}

const SPACING = /^(?:padding|margin)(?:-(?:top|right|bottom|left))?$|^(?:letter|word)-spacing$/

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
  if (HIDING_PROPERTIES.has(prop))
    return `${said}: may make content disappear (hidden, faded, zero size or off screen)`
  if (!ALLOWED_PROPERTIES[prop]) return `${said}: ${prop} is not on the style allow list`
  if (prop === 'color' && isInvisibleColour(value)) return `${said}: makes the text disappear`
  const why =
    (prop === 'font-size' && fontSizeRefusal(value)) ||
    (prop === 'line-height' && lineHeightRefusal(value)) ||
    (SPACING.test(prop) && spacingRefusal(prop, value)) ||
    (prop === 'white-space' &&
      !/^(?:normal|pre-line|pre-wrap|break-spaces)$/.test(value.trim()) &&
      'only wrapping white space is allowed')
  return why ? `${said}: ${why}` : null
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
  const pair = refusals.length ? null : colourPairRefusal(entries)
  if (pair) refusals.push(pair)
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
