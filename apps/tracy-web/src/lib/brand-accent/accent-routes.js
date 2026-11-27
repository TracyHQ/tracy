// Shared: the brand step and the write step read it, so it lives in lib/ (module-graph.test.mjs).
// The routes a template's accent takes through its compiled stylesheets, read from those stylesheets and nothing else, so no
// template is named here: which custom properties hold it, which rules write it by hand, which read it for words and which
// for fills. Pure. `accent-module.js` turns the routes into the override.
import { coloursIn, isAccent, isShade, tripleIn } from './accent-colours.js'
import { readRules } from './css-rules.js'
import { sameSpecificity, selectorList } from './css-specificity.js'

/** A status colour stays whatever hue it shares with the accent: an error must still read as an error. */
const STATUS = /danger|error|invalid|alert|warning|success|required|destructive/i
/** Words: the properties that need the accent's readable tone rather than its fill. */
export const WORD_PROPS = new Set([
  'color',
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
  'text-decoration-color',
  'text-emphasis-color',
  'caret-color'
])
const STATE = /:(?:hover|focus-visible|focus-within|focus|active)\b/g
const STATE_VAR = /hover|active|focus|pressed/i

const isVar = (prop) => prop.startsWith('--')

/** Each `var(--name, fallback)` at the top of a value, its nested ones left to the fallback. */
function varsIn(value) {
  const found = []
  const text = String(value)
  let i = text.indexOf('var(')
  while (i !== -1) {
    let depth = 1
    let j = i + 4
    let comma = -1
    while (j < text.length && depth > 0) {
      if (text[j] === '(') depth++
      else if (text[j] === ')') depth--
      else if (text[j] === ',' && depth === 1 && comma === -1) comma = j
      j++
    }
    const end = j - 1
    found.push({
      name: text.slice(i + 4, comma === -1 ? end : comma).trim(),
      fallback: comma === -1 ? '' : text.slice(comma + 1, end)
    })
    i = text.indexOf('var(', j)
  }
  return found
}

/** A value's selectors without their states, to tell a rule's hover from its resting look. */
const restingParts = (selector) =>
  selector.split(',').map((part) => part.replace(STATE, '').replace(/\s+/g, ' ').trim())

const paintGroup = (prop) => {
  if (WORD_PROPS.has(prop)) return 'word'
  if (prop.startsWith('background')) return 'ground'
  if (prop.startsWith('border') || prop.startsWith('outline')) return 'line'
  return prop
}

/** Rules in source order, a declaration that a later one of the same selector overrides left out. */
function effectiveDecls(rules) {
  const last = new Map()
  const list = []
  for (const rule of rules)
    for (const decl of rule.decls) {
      const key = `${rule.at.join('|')}|${rule.selector}|${decl.prop}`
      const was = last.get(key)
      if (was && was.decl.important && !decl.important) continue
      const entry = { rule, decl }
      if (was) was.gone = true
      last.set(key, entry)
      list.push(entry)
    }
  return list.filter((e) => !e.gone)
}

/**
 * @param {string[]} sheets the template's stylesheets as served, in page order
 * @param {string} seed the template's accent, #rrggbb
 * @returns {object} the routes: `literal` (declarations that write the accent), `rescope` (rules reading it for words through a
 *   variable that also feeds fills), `roles` (source variable to its tone), `words` (rules with words on an accent ground),
 *   `keyframes`, `colours` (the family as written in the sheets)
 */
export function accentRoutes(sheets, seed) {
  // A sheet a page links twice cascades as its last copy: read once, there.
  const once = sheets.filter((css, i) => sheets.lastIndexOf(css) === i)
  const parsed = once.map((css) => readRules(css))
  const decls = parsed.flatMap((p) => effectiveDecls(p.rules))
  const colours = new Set([seed])
  const seedLike = (hex) => {
    const yes = isAccent(hex, seed)
    if (yes) colours.add(hex)
    return yes
  }

  // Custom properties: the ones that hold the accent, then those that read them.
  const defined = new Map()
  for (const { decl } of decls)
    if (isVar(decl.prop)) defined.set(decl.prop, [...(defined.get(decl.prop) ?? []), decl.value])
  const familyLiterals = (entry) => {
    const { rule, decl } = entry
    if (STATUS.test(rule.selector) || STATUS.test(decl.prop)) return []
    return coloursIn(decl.value).filter((c) => {
      if (seedLike(c.hex)) return true
      const shade = isVar(decl.prop) && STATE_VAR.test(decl.prop) && isShade(c.hex, seed)
      if (shade) colours.add(c.hex)
      return shade
    })
  }
  const sources = new Set()
  for (const entry of decls) {
    if (!isVar(entry.decl.prop) || STATUS.test(entry.rule.selector) || STATUS.test(entry.decl.prop)) continue
    const triple = tripleIn(entry.decl.value)
    if (familyLiterals(entry).length || (triple && isAccent(triple, seed))) sources.add(entry.decl.prop)
  }
  const accentVars = new Set(sources)
  /** The accent variables a value reads now: an unset variable falls to its fallback, a set one is what it is. */
  const readBy = (value) =>
    varsIn(value).flatMap(({ name, fallback }) => {
      if (defined.has(name)) return accentVars.has(name) ? [name] : []
      return fallback ? readBy(fallback) : []
    })
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, values] of defined)
      if (!accentVars.has(name) && values.some((v) => readBy(v).length)) {
        accentVars.add(name)
        grew = true
      }
  }
  const closure = (name, seen = new Set()) => {
    if (seen.has(name)) return []
    seen.add(name)
    if (sources.has(name)) return [name]
    return (defined.get(name) ?? []).flatMap((v) => readBy(v).flatMap((n) => closure(n, seen)))
  }

  // Tones: a source that only ever feeds words takes the readable tone; one that feeds anything else takes the fill.
  const fills = new Set()
  const fed = new Set()
  for (const { decl } of decls) {
    if (isVar(decl.prop)) continue
    for (const name of readBy(decl.value))
      for (const source of closure(name)) {
        fed.add(source)
        if (!WORD_PROPS.has(decl.prop)) fills.add(source)
      }
  }
  const roles = new Map([...sources].map((s) => [s, fed.has(s) && !fills.has(s) ? 'word' : 'fill']))

  // Declarations: what writes the accent by hand, and what reads it for words through a fill variable.
  const literal = []
  const rescope = []
  const painted = new Set()
  const words = []
  const addPainted = (rule, prop) => {
    for (const part of restingParts(rule.selector)) painted.add(`${part}|${paintGroup(prop)}`)
  }
  for (const entry of decls) {
    const { rule, decl } = entry
    const family = familyLiterals(entry)
    if (isVar(decl.prop)) {
      const triple = tripleIn(decl.value)
      if (family.length || (triple && sources.has(decl.prop)))
        literal.push({ rule, decl, family, triple: Boolean(triple), tone: roles.get(decl.prop) ?? 'fill' })
      continue
    }
    const read = readBy(decl.value)
    if (family.length || read.length) addPainted(rule, decl.prop)
    if (family.length) {
      literal.push({ rule, decl, family, tone: WORD_PROPS.has(decl.prop) ? 'word' : 'fill' })
      continue
    }
    if (WORD_PROPS.has(decl.prop))
      for (const name of new Set(read))
        if (closure(name).some((s) => roles.get(s) === 'fill')) rescope.push({ rule, name })
  }

  // A state of a painted rule: its own darker or lighter shade of the accent is the family too.
  for (const entry of decls) {
    const { rule, decl } = entry
    if (isVar(decl.prop) || STATUS.test(rule.selector) || !rule.selector.match(STATE)) continue
    if (familyLiterals(entry).length) continue
    if (!restingParts(rule.selector).some((part) => painted.has(`${part}|${paintGroup(decl.prop)}`))) continue
    const shades = coloursIn(decl.value).filter((c) => isShade(c.hex, seed))
    for (const shade of shades) colours.add(shade.hex)
    if (shades.length)
      literal.push({ rule, decl, family: shades, tone: WORD_PROPS.has(decl.prop) ? 'word' : 'fill' })
  }

  // Words on an accent ground: a rule that fills with the accent and writes its own word colour.
  for (const { rule, decl } of decls) {
    if (!decl.prop.startsWith('background') || STATUS.test(rule.selector)) continue
    if (!coloursIn(decl.value).some((c) => isAccent(c.hex, seed)) && !readBy(decl.value).length) continue
    const own = rule.decls.find((d) => d.prop === 'color')
    const colour = own && coloursIn(own.value)[0]
    if (colour) words.push({ rule, hex: colour.hex, important: own.important })
  }

  const keyframes = parsed
    .flatMap((p) => p.keyframes)
    .filter((k) => coloursIn(k.body).some((c) => seedLike(c.hex)))

  return {
    literal,
    rescope,
    words,
    keyframes,
    roles,
    colours: [...colours],
    ...orderKept(decls, literal, colours)
  }
}

/**
 * The rivals to repeat (`laterRivals`), and the tail of the module that keeps the template's order: from the first rival
 * on, every rival and every literal route of the stylesheets in their source order, so a route that came after a rival
 * still comes after it.
 */
function orderKept(decls, literal, colours) {
  // Only the routes the module always writes: a word on an accent ground is written only when it would not read.
  const restore = laterRivals(decls, literal, (hex) => colours.has(hex))
  if (!restore.length) return { restore, tail: [] }
  const index = new Map(decls.map((e, i) => [e.decl, i]))
  const from = restore[0].index
  const routes = literal
    .filter((l) => !isVar(l.decl.prop) && (index.get(l.decl) ?? -1) > from)
    .map((route) => ({ route, index: index.get(route.decl) }))
  const tail = [...restore.map((r) => ({ restore: r, index: r.index })), ...routes].sort(
    (a, b) => a.index - b.index
  )
  return { restore, tail }
}

/**
 * The template's own declarations that win over an accent route by coming later: the module repeats a route at the end of
 * the page, so a later rule of the same weight (specificity and `!important`) that sets the same paint (a ground, a line,
 * the words) would lose to it there, though it won in the template. Dev arabian-tea-lat37b (JA Diner Joomla, 27/11/2026):
 * `.btn-primary{background-color: accent}` came before `.off-canvas-toggle{background-color: transparent}`, and the module's
 * copy of `.btn-primary` painted the phone menu's button in the accent (5 brand-accent blocks). Each rival is repeated,
 * verbatim, after the routes (accent-module.js), so the template's order holds again for every element both reach.
 * @param {{ rule: object, decl: object }[]} decls the effective declarations in source order
 * @param {{ rule: object, decl: object }[]} routes
 * @returns {{ rule: object, decl: object, index: number }[]} in source order, `index` its place among `decls`
 */
function laterRivals(decls, routes, inFamily) {
  const index = new Map(decls.map((e, i) => [e.decl, i]))
  const routeDecls = new Set(routes.map((r) => r.decl))
  const held = []
  for (const r of routes) {
    const channels = channelsOf(r.decl.prop)
    if (!channels) continue
    held.push({
      at: index.get(r.decl) ?? -1,
      channels,
      parts: selectorList(r.rule.selector),
      important: Boolean(r.decl.important)
    })
  }
  const out = []
  decls.forEach((entry, i) => {
    const { rule, decl } = entry
    // A status rule keeps its colour where it is, and a rule that paints the template's accent by hand is a route the
    // reader left out on purpose: repeating either would paint the old accent again.
    if (
      routeDecls.has(decl) ||
      STATUS.test(rule.selector) ||
      coloursIn(decl.value).some((c) => inFamily(c.hex))
    )
      return
    const channels = channelsOf(decl.prop)
    if (!channels) return
    const parts = selectorList(rule.selector)
    const beats = held.some(
      (r) =>
        r.at < i &&
        r.important === Boolean(decl.important) &&
        [...channels].some((c) => r.channels.has(c)) &&
        r.parts.some((a) =>
          parts.some((b) => oneCompound(a) && oneCompound(b) && sameSpecificity(a, b) && mayMeet(a, b))
        )
    )
    if (beats) out.push({ rule, decl, index: i })
  })
  return out
}

const SIDES = ['top', 'right', 'bottom', 'left']
const LOGICAL = { 'block-start': 'top', 'block-end': 'bottom', 'inline-start': 'left', 'inline-end': 'right' }
/**
 * The colours a property sets, as channels: the ground, each side of the border, the outline, the words. Null for a
 * property that sets no colour (a radius, a width, a picture).
 */
function channelsOf(prop) {
  if (prop === 'background' || prop === 'background-color') return new Set(['ground'])
  if (prop === 'outline' || prop === 'outline-color') return new Set(['outline'])
  if (WORD_PROPS.has(prop)) return new Set([`word:${prop}`])
  if (prop === 'border' || prop === 'border-color') return new Set(SIDES.map((s) => `line:${s}`))
  const side =
    /^border-(top|right|bottom|left|block-start|block-end|inline-start|inline-end|block|inline)(?:-color)?$/.exec(
      prop
    )?.[1]
  if (!side) return null
  if (side === 'block') return new Set(['line:top', 'line:bottom'])
  if (side === 'inline') return new Set(['line:left', 'line:right'])
  return new Set([`line:${LOGICAL[side] ?? side}`])
}

/** The last compound of a selector: its tag, ids and pseudo-element, which one element has at most one of each. */
function subjectOf(selector) {
  const last =
    String(selector)
      .trim()
      .split(/\s*[\s>+~]\s*(?![^(]*\))/)
      .pop() ?? ''
  return {
    tag: /^([a-z][\w-]*)/i.exec(last)?.[1]?.toLowerCase() ?? null,
    ids: [...last.matchAll(/#([\w-]+)/g)].map((m) => m[1]),
    element:
      /::?(before|after|first-line|first-letter|placeholder|marker|selection)\b/i
        .exec(last)?.[1]
        ?.toLowerCase() ?? null
  }
}

/**
 * A selector of one compound, no combinator (`.off-canvas-toggle`, `.btn-primary:hover`): two such rules of one weight
 * reach one element whenever it wears both, which a template's markup does all the time (a button with a component class
 * and a utility class). A rule of a deeper path reaches its element through a context that rarely meets another's at the
 * same weight, and repeating every such rival would not fit a module (JA Diner Joomla: 798 rivals, 83 KB).
 */
const oneCompound = (selector) =>
  !/[\s>+~]/.test(
    String(selector)
      .trim()
      .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  )

/** Whether two selectors may reach one element: not two tags, two ids or two pseudo-elements that differ. */
function mayMeet(a, b) {
  const x = subjectOf(a)
  const y = subjectOf(b)
  if (x.tag && y.tag && x.tag !== y.tag) return false
  if (x.ids.length && y.ids.length && !x.ids.some((id) => y.ids.includes(id))) return false
  return x.element === y.element
}
