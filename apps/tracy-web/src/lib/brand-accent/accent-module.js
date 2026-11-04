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

const VALUE_FORMS = (hex) => {
  const triple = tripleOf(hex)
  return [hex, hex.toUpperCase(), `rgb(${triple})`, `rgb(${triple.replaceAll(',', ', ')})`]
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
        VALUE_FORMS(hex).flatMap((form) => [`${lead}${form}"]`, `${lead} ${form}"]`])
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

  for (const { rule, decl, family, triple, tone } of routes.literal) {
    const variable = tone === 'word' ? WORD : FILL
    const value = triple
      ? tripleOf(accent)
      : swapped(decl.value, family, variable, seed, encodeURIComponent(accent))
    add(wrap(rule.at, `${rule.selector}{${decl.prop}:${value}${bang(decl.important)}}`))
  }
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
  for (const hex of routes.colours) add(markupRules(hex, FILL, WORD))

  const html = moduleText({
    lines,
    tones,
    opens,
    accent,
    seed,
    family: routes.colours,
    words: wordsMoved ? readable : null
  })
  const bytes = Buffer.byteLength(html)
  if (bytes > ACCENT_MODULE_LIMIT)
    return { problem: `the accent module is ${bytes} bytes, over the limit of ${ACCENT_MODULE_LIMIT}` }
  return {
    html,
    bytes,
    family: routes.colours,
    routes: {
      written: routes.literal.length,
      words: routes.rescope.length,
      sources: [...routes.roles.keys()]
    }
  }
}

/** The style itself: the slot line older readers look for, the facts the site check judges by, the side a template opens on. */
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
