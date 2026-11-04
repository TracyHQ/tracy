// The look guard's judgement of a stylesheet we inject (ADR 0044, decision 10). Only colour may change, and only where the template
// itself paints its accent, so a declaration passes when the template's own stylesheets hold the same selector and property with
// the same value apart from its colours. A corner, a font, a size or a border width is in no such route. Pure.
import { coloursIn, tripleIn } from '../brand-step/accent-colours.js'
import { accentRoutes } from '../brand-step/accent-routes.js'
import { readRules } from '../brand-step/css-rules.js'

const TONES = new Set(['--tracy-accent', '--tracy-accent-text'])
const HEX = /^#[0-9a-f]{6}$/i
const TONE_VALUE = /^var\(--tracy-accent(?:-text)?\)$/
const ROOT = /^:root\b/
const MARKUP_PART = /^\[(?:(?:fill|stroke|stop-color|flood-color)="#[0-9a-f]{6}" i|style[\^*]="[^"]*")\]$/i
const MARKUP_PROPS = new Set([
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'color',
  'background-color',
  'border-color'
])
const COLOUR_PROP =
  /^(?:color|fill|stroke|stop-color|flood-color|caret-color|accent-color|background-color|outline-color|text-decoration-color|text-emphasis-color|column-rule-color|-webkit-text-fill-color|-webkit-text-stroke-color|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color)$/
const ALLOWED_AT = /^@(?:media|supports|layer|container)\b/i
const KEYFRAMES = /^@(?:-\w+-)?keyframes\b/i

const keyOf = (at, selector, prop = '') => JSON.stringify([at, selector, prop])
const said = (text) => String(text).replace(/\s+/g, ' ').trim().toLowerCase()

/** Where a `color-mix(` that holds a brand tone ends, or -1. */
function mixEnd(text, from) {
  let depth = 0
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

/** Brand tones written through `color-mix`, as one mark. */
function withoutMixes(text) {
  let out = ''
  let i = 0
  for (;;) {
    const at = text.indexOf('color-mix(', i)
    if (at === -1) return out + text.slice(i)
    const end = mixEnd(text, at)
    if (end === -1) return out + text.slice(i)
    out +=
      text.slice(i, at) + (text.slice(at, end).includes('--tracy-accent') ? '#' : text.slice(at, end + 1))
    i = end + 1
  }
}

/** A value with its colours gone: what must stay the template's. */
function shapeOf(value, { keepMixes = false } = {}) {
  if (tripleIn(value)) return '#'
  const kept = keepMixes ? String(value) : withoutMixes(String(value))
  const text = kept.replace(/var\(--tracy-accent(?:-text)?\)/g, '#')
  let out = ''
  let from = 0
  for (const c of coloursIn(text)) {
    out += `${text.slice(from, c.index)}#`
    from = c.index + c.text.length
  }
  return said(out + text.slice(from))
}

/**
 * What the template's stylesheets allow an accent style to write.
 * @param {string[]} sheets @param {string} seed
 * @returns {{ decls: Map<string, Set<string>>, keyframes: Map<string, Set<string>> }} the shapes by rule and property
 */
export function accentRoutesOf(sheets, seed) {
  const routes = accentRoutes(sheets, String(seed).toLowerCase())
  const decls = new Map()
  const keyframes = new Map()
  const put = (map, key, shape) => map.set(key, new Set([...(map.get(key) ?? []), shape]))
  for (const { rule, decl } of routes.literal)
    put(decls, keyOf(rule.at, rule.selector, decl.prop), shapeOf(decl.value))
  for (const { rule, name } of routes.rescope) put(decls, keyOf(rule.at, rule.selector, name), '#')
  for (const { rule } of routes.words) put(decls, keyOf(rule.at, rule.selector, 'color'), '#')
  for (const k of routes.keyframes) put(keyframes, keyOf(k.at, k.head), shapeOf(k.body))
  return { decls, keyframes }
}

const bare = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .replace(/url\([^)]*\)/gi, 'url()')

/** What the rule reader would skip without a word: a rule that never closes, an import, a font. */
function unreadFaults(css) {
  const text = bare(css)
  const faults = []
  const open = (text.match(/\{/g) ?? []).length
  if (open !== (text.match(/\}/g) ?? []).length)
    return [{ selector: null, prop: null, reason: 'the stylesheet has a rule that does not close' }]
  for (const [at] of text.matchAll(/@[\w-]+/g))
    if (!ALLOWED_AT.test(at) && !KEYFRAMES.test(at))
      faults.push({ selector: at, prop: at, reason: `${at} changes more than a colour` })
  return faults
}

const markupForm = (selector, { prop, value }) =>
  selector.split(/,(?=\[)/).every((part) => MARKUP_PART.test(part.trim())) &&
  MARKUP_PROPS.has(prop) &&
  TONE_VALUE.test(value)

function declFault(rule, decl, routes) {
  const fault = (reason) => ({
    selector: rule.selector,
    prop: decl.prop,
    value: decl.value.slice(0, 80),
    reason
  })
  if (ROOT.test(rule.selector) && TONES.has(decl.prop))
    return HEX.test(decl.value) ? null : fault(`${decl.prop} holds no colour`)
  if (markupForm(rule.selector, decl)) return null
  const allowed = routes?.decls.get(keyOf(rule.at, rule.selector, decl.prop))
  if (allowed)
    // A template that mixes its accent itself keeps its mix: only the colour inside it changes.
    return allowed.has(shapeOf(decl.value)) || allowed.has(shapeOf(decl.value, { keepMixes: true }))
      ? null
      : fault(
          `${decl.prop} changes more than its colour: it differs from the template's own value (${rule.selector.slice(0, 80)}: ${decl.value.slice(0, 80)})`
        )
  const isColour = COLOUR_PROP.test(decl.prop) || (decl.prop.startsWith('--') && shapeOf(decl.value) === '#')
  return fault(
    isColour
      ? `${decl.prop} on ${rule.selector.slice(0, 60)} is not a route of the template's accent`
      : `${decl.prop} is not a colour`
  )
}

/**
 * @param {string} css a stylesheet we are about to inject
 * @param {{ routes?: ReturnType<typeof accentRoutesOf> | null, except?: (rule: object, decl: object) => boolean }} input
 *   `except`: a stated exception of the caller
 * @returns {{ selector: string | null, prop: string | null, value?: string, reason: string }[]} empty when only the accent moves
 */
export function cssFaults(css, { routes = null, except = () => false } = {}) {
  const faults = unreadFaults(css)
  if (faults.some((f) => f.selector === null)) return faults
  const { rules, keyframes } = readRules(css)
  for (const rule of rules)
    for (const decl of rule.decls) {
      if (except(rule, decl)) continue
      const fault = declFault(rule, decl, routes)
      if (fault) faults.push(fault)
    }
  for (const k of keyframes) {
    const allowed = routes?.keyframes.get(keyOf(k.at, k.head))
    if (!allowed?.has(shapeOf(k.body)))
      faults.push({
        selector: k.head,
        prop: k.head,
        reason: `${k.head} is not an animation of the template's accent, with only its colours changed`
      })
  }
  return faults
}

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi

/** The style blocks of a piece of HTML, and the HTML without them. */
export function stylesOf(html) {
  const text = String(html ?? '')
  return {
    blocks: [...text.matchAll(STYLE_BLOCK)].map((m) => ({ whole: m[0], css: m[1] })),
    rest: text.replace(STYLE_BLOCK, '')
  }
}
