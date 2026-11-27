// Shared: the brand step and the write step build it, so it lives in lib/ (module-graph.test.mjs).
// Accent-only mode: the module a site wears so that only the template's accent family changes (#378). Corners, fonts, weights,
// sizes, borders, grounds and body text stay the template's, because nothing here names them: the override is made of the
// routes `accent-routes.js` read from the template's own stylesheets, plus the attribute forms a page can write in its markup.
// It keeps the style id and the slot line the older readers look for, and the `mode` line a template opens its page by.
import { coloursIn, paintFor, tripleOf } from './accent-colours.js'
import { accentRoutes } from './accent-routes.js'
import { contrastHex } from './colour-math.js'

export const ACCENT_MODULE_LIMIT = 64000
export const ACCENT_SLOT_STEM = 'brand:accent-only-'
const FILL = '--tracy-accent'
const WORD = '--tracy-accent-text'
const WORDS_MIN = 3

const shiftOf = (shifts, side, colour) =>
  (Array.isArray(shifts) ? shifts : []).find((s) => s?.side === side && s?.colour === colour)?.to ?? null

/** Fill and word tones per side, from the brand file's own numbers. */
function tonesOf({ accent, shifts }) {
  const side = (name) => ({
    fill: shiftOf(shifts, name, 'accent') ?? accent,
    word: shiftOf(shifts, name, 'accent-text') ?? accent
  })
  return { light: side('light'), dark: side('dark') }
}

const openingSide = (shifts) =>
  (Array.isArray(shifts) ? shifts : []).find((s) => s?.opens === true)?.side ?? null

/** The tones as variables: the light side, and the dark side under the template's mark. No mark: the side the page opens on. */
function toneRules(tones, opens, darkHook) {
  const base = darkHook || !opens ? tones.light : tones[opens]
  const rules = [`:root{${FILL}:${base.fill};${WORD}:${base.word}}`]
  if (darkHook && (tones.dark.fill !== base.fill || tones.dark.word !== base.word))
    rules.push(`:root${darkHook}{${FILL}:${tones.dark.fill};${WORD}:${tones.dark.word}}`)
  return rules
}

const swapped = (value, family, variable, seed, encode) => {
  let out = ''
  let from = 0
  for (const c of [...family].sort((a, b) => a.index - b.index)) {
    out += value.slice(from, c.index) + (c.encoded ? encode : paintFor(variable, c, seed))
    from = c.index + c.text.length
  }
  return out + value.slice(from)
}

const wrap = (at, rule) => at.reduceRight((inner, head) => `${head}{${inner}}`, rule)
const bang = (important) => (important ? '!important' : '')

// The forms an inline style writes a colour in. The selectors match them case-insensitively (`i`), so `#E08A70` and
// `RGB(` need no selector of their own: a fifth of the module on a template with a nine-colour accent family.
const VALUE_FORMS = (hex) => {
  const triple = tripleOf(hex)
  return [hex, `rgb(${triple})`, `rgb(${triple.replaceAll(',', ', ')})`]
}
const LEADS = (prop) => [`[style^="${prop}:`, `[style*=";${prop}:`, `[style*="; ${prop}:`]

/** What a page's markup can write itself: SVG paint attributes and inline styles the stylesheets cannot reach otherwise. */
function markupRules(hex, fill, word) {
  const attrs = ['fill', 'stroke', 'stop-color', 'flood-color']
    .map((a) => `[${a}="${hex}" i]{${a}:var(${fill})}`)
    .join('')
  const inline = [
    ['color', 'color', word],
    ['background-color', 'background-color', fill],
    ['background', 'background-color', fill],
    ['border-color', 'border-color', fill],
    ['fill', 'fill', fill],
    ['stroke', 'stroke', fill]
  ]
    .map(([written, prop, tone]) => {
      const selectors = LEADS(written).flatMap((lead) =>
        VALUE_FORMS(hex).flatMap((form) => [`${lead}${form}" i]`, `${lead} ${form}" i]`])
      )
      return `${selectors.join(',')}{${prop}:var(${tone})!important}`
    })
    .join('')
  return attrs + inline
}

/**
 * @param {{ sheets: string[], colours: { accent: string, replaces: string, shifts?: object[] }, darkHook?: string | null }} input
 *   `darkHook`: the condition on the root that marks a template's dark side (a slot contract's `modeHook`)
 * @returns {{ html?: string, bytes?: number, routes?: object, family?: string[], problem?: string }}
 */
export function accentModule({ sheets, colours, darkHook = null }) {
  const seed = String(colours?.replaces ?? '').toLowerCase()
  const accent = String(colours?.accent ?? '').toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(seed) || !/^#[0-9a-f]{6}$/.test(accent))
    return { problem: 'the brand file does not name the accent and the colour it replaces' }
  const routes = accentRoutes(sheets, seed)
  if (!routes.literal.length)
    return { problem: `the template's stylesheets do not paint its accent ${seed} anywhere` }

  const tones = tonesOf({ accent, shifts: colours.shifts })
  const opens = openingSide(colours.shifts)
  const lines = toneRules(tones, opens, darkHook)
  const add = (line) => {
    if (!lines.includes(line)) lines.push(line)
  }

  const routeLine = ({ rule, decl, family, triple, tone }) => {
    const variable = tone === 'word' ? WORD : FILL
    const value = triple
      ? tripleOf(accent)
      : swapped(decl.value, family, variable, seed, encodeURIComponent(accent))
    return wrap(rule.at, `${rule.selector}{${decl.prop}:${value}${bang(decl.important)}}`)
  }
  // A route of the order-keeping tail is written there, in its place among the rivals, and not twice.
  const inTail = new Set(routes.tail.filter((t) => t.route).map((t) => t.route))
  for (const route of routes.literal) if (!inTail.has(route)) add(routeLine(route))
  for (const { rule, name } of routes.rescope) add(wrap(rule.at, `${rule.selector}{${name}:var(${WORD})}`))
  const readable = contrastHex(accent, '#ffffff') >= contrastHex(accent, '#000000') ? '#ffffff' : '#000000'
  let wordsMoved = false
  for (const { rule, hex, important } of routes.words)
    if (contrastHex(hex, accent) < WORDS_MIN) {
      wordsMoved = true
      add(wrap(rule.at, `${rule.selector}{color:${readable}${bang(important)}}`))
    }
  for (const k of routes.keyframes) {
    const family = coloursIn(k.body).filter((c) => routes.colours.includes(c.hex))
    add(wrap(k.at, `${k.head}{${swapped(k.body, family, FILL, seed, encodeURIComponent(accent))}}`))
  }
  // The markup forms of each colour of the family, the template's accent first (routes.colours keeps it first). Every
  // stylesheet route always goes in; a module over the limit drops the markup forms of the last family colours, one
  // by one, and keeps the brand accent, rather than leaving the template's accent everywhere (dev, JA Diner 16/11/2026:
  // the module of every page's sheets was 121114 bytes and the site kept the template's colour, a final-check block).
  // A page whose own markup writes a dropped shade inline keeps that shade there; the stylesheets still move.
  const markup = routes.colours.map((hex) => markupRules(hex, FILL, WORD))
  // The template's order, kept (accent-routes.js `laterRivals`): its own later rules of the same weight, verbatim, with the
  // routes among them, after everything else. They are never joined: a joined rule may move before a shorthand.
  const tail = routes.tail.map((t) =>
    t.route
      ? routeLine(t.route)
      : wrap(
          t.restore.rule.at,
          `${t.restore.rule.selector}{${t.restore.decl.prop}:${t.restore.decl.value}${bang(t.restore.decl.important)}}`
        )
  )
  const built = (n) => {
    const html = moduleText({
      lines: [
        ...compactRules([...lines, ...markup.slice(0, n).filter((line) => !lines.includes(line))]),
        ...tail
      ],
      tones,
      opens,
      accent,
      seed,
      family: routes.colours,
      words: wordsMoved ? readable : null
    })
    return { html, bytes: Buffer.byteLength(html) }
  }
  let kept = markup.length
  let { html, bytes } = built(kept)
  while (bytes > ACCENT_MODULE_LIMIT && kept > 1) {
    kept -= 1
    ;({ html, bytes } = built(kept))
  }
  if (bytes > ACCENT_MODULE_LIMIT)
    return { problem: `the accent module is ${bytes} bytes, over the limit of ${ACCENT_MODULE_LIMIT}` }
  return {
    html,
    bytes,
    family: routes.colours,
    ...(kept < markup.length ? { markupOmitted: routes.colours.slice(kept) } : {}),
    routes: {
      written: routes.literal.length,
      words: routes.rescope.length,
      kept: routes.restore.length,
      sources: [...routes.roles.keys()]
    }
  }
}

/** The style itself: the slot line older readers look for, the facts the site check judges by, the side a template opens on. */
// One rule line as `wrap` writes it: the at-rule heads around it, its selector and its one declaration.
const ONE_RULE = /^((?:[^{}]+\{)*)([^{}]+)\{([^{}:]+):([^{}]*)\}(\}*)$/
// A property's name as CSS compares it: case-insensitive, but a custom property (`--name`) is case-sensitive.
const propOf = (name) => (name.trim().startsWith('--') ? name.trim() : name.trim().toLowerCase())
// Rules side by side with no at-rule around them: `sel{prop:value}sel{prop:value}`.
const FLAT_RULES = /[^{}]+\{[^{}]*\}/g
// A selector a browser may not know drops every selector of its list with it: such a selector keeps a rule of its own.
const OWN_RULE = /:-|::-|:has\(|:is\(|:where\(|:host|::part|::slotted/i

/**
 * The module's rules with the same declaration under the same at-rules joined into one selector list, so a template
 * that paints its accent in many rules still fits the module (dev, JA Diner 16/11/2026: 75708 and 121114 bytes, over
 * the 64000 a module holds, so the site kept the template's accent: a final-check block). A rule joins an earlier one
 * only when no rule between them sets the same property to another value, so no element can end up with another value; a
 * line that is not one plain rule (several rules, a keyframe) is never joined and stops every join across it. A
 * selector a browser may not know (a vendor pseudo-class, `:has()`) keeps its own rule, since one unknown selector
 * drops its whole list.
 * @param {string[]} lines
 * @returns {string[]}
 */
export function compactRules(lines) {
  /** @type {{ line: string, rule: null | { heads: string, selectors: string[], prop: string, value: string, own: boolean } }[]} */
  const out = []
  // A line of several flat rules side by side (the markup forms of one colour) is read as its rules, in order.
  const split = lines.flatMap((line) => {
    const rules = line.match(FLAT_RULES)
    return rules && rules.join('') === line ? rules : [line]
  })
  for (const line of split) {
    const m = ONE_RULE.exec(line)
    const heads = m?.[1] ?? ''
    const parsed =
      m && m[5].length === (heads.match(/\{/g) ?? []).length
        ? { heads, selectors: [m[2].trim()], prop: propOf(m[3]), value: m[4].trim(), own: !joinable(m[2]) }
        : null
    if (!parsed) {
      out.push({ line, rule: null })
      continue
    }
    let joined = false
    for (let i = out.length - 1; i >= 0 && !parsed.own; i -= 1) {
      const earlier = out[i].rule
      if (!earlier) break
      if (
        !earlier.own &&
        earlier.heads === parsed.heads &&
        earlier.prop === parsed.prop &&
        earlier.value === parsed.value
      ) {
        for (const selector of parsed.selectors)
          if (!earlier.selectors.includes(selector)) earlier.selectors.push(selector)
        joined = true
        break
      }
      // The same property with another value: the later rule must stay after it. The same value cannot change what wins.
      if (earlier.prop === parsed.prop && earlier.value !== parsed.value) break
    }
    if (!joined) out.push({ line, rule: parsed })
  }
  return out.map(({ line, rule }) =>
    rule
      ? `${rule.heads}${rule.selectors.join(',')}{${rule.prop}:${rule.value}}${'}'.repeat((rule.heads.match(/\{/g) ?? []).length)}`
      : line
  )
}

/**
 * A selector list's selectors, split at its top-level commas only: a comma inside brackets, parentheses or quotes
 * (`[style*="rgb(1, 2, 3)"]`, `:is(.a, .b)`) belongs to its selector. The write step's look guard reads a joined rule
 * the same way (look-guard-css.js).
 * @param {string} selector
 * @returns {string[]}
 */
export function selectorParts(selector) {
  const parts = []
  let depth = 0
  let quote = null
  let from = 0
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i]
    if (quote) {
      if (ch === quote && selector[i - 1] !== '\\') quote = null
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(from, i).trim())
      from = i + 1
    }
  }
  parts.push(selector.slice(from).trim())
  return parts.filter(Boolean)
}

/** A selector of the markup forms (markupRules): an SVG paint attribute or an inline style, of one colour. */
export const MARKUP_SELECTOR =
  /^\[(?:(?:fill|stroke|stop-color|flood-color)="#[0-9a-f]{6}" i|style[\^*]="[^"]*"(?: i)?)\]$/i

// A rule may join a list when a browser surely knows its selector and the look guard can still read each part: one
// selector, or a list of markup forms only. A template's own list (`.a, .b`) keeps its rule, as its route names it.
function joinable(selector) {
  if (OWN_RULE.test(selector)) return false
  const parts = selectorParts(selector)
  return parts.length === 1 || parts.every((part) => MARKUP_SELECTOR.test(part))
}

function moduleText({ lines, tones, opens, accent, seed, family, words, note = '' }) {
  const slot = `${ACCENT_SLOT_STEM}${accent.slice(1)}`
  const facts = [
    `replaces=${seed}`,
    `accent=${accent}`,
    `light-text=${tones.light.word}`,
    `dark-text=${tones.dark.word}`,
    `family=${family.join(',')}`,
    ...(words ? [`words=${words}`] : [])
  ].join(' ')
  const mode = opens ? `/* mode: ${opens} */\n` : ''
  return `<style id="tracy-ds-slot">/* tracy-ds-slot: ${slot} */\n/* accent-only: ${facts} */\n${mode}${note}${lines.join('\n')}</style>`
}

/**
 * What the brand step can make without a site: the accent's tones and the markup forms. The write step, which can read the
 * stylesheets the template serves, makes the whole module from the same colours. `note` carries what the picture step reads.
 * @param {{ colours: { accent: string, replaces: string, shifts?: object[] }, darkHook?: string | null, note?: string }} input
 */
export function accentSeedModule({ colours, darkHook = null, note = '' }) {
  const seed = colours.replaces.toLowerCase()
  const accent = colours.accent.toLowerCase()
  const tones = tonesOf({ accent, shifts: colours.shifts })
  const opens = openingSide(colours.shifts)
  return moduleText({
    lines: [...toneRules(tones, opens, darkHook), markupRules(seed, FILL, WORD)],
    tones,
    opens,
    accent,
    seed,
    family: [seed],
    words: null,
    note
  })
}
