// The routes a template's accent takes through its compiled stylesheets, read from those stylesheets and nothing else, so no
// template is named here: which custom properties hold it, which rules write it by hand, which read it for words and which
// for fills. Pure. `accent-module.js` turns the routes into the override.
import { coloursIn, isAccent, isShade, tripleIn } from './accent-colours.js'
import { readRules } from './css-rules.js'

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
  const parsed = sheets.map((css) => readRules(css))
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

  return { literal, rescope, words, keyframes, roles, colours: [...colours] }
}
