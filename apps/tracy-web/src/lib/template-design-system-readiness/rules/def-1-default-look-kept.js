/**
 * DEF-1: with no system worn, the template looks exactly as released.
 *
 * The slot's variables exist only while a system is worn (`colourVars`, the EmDash bridge), so every
 * read of one must carry the template's own value as its fallback: `var(--ds-c-bg, #f8f8ff)`. A read
 * without a fallback, or whose fallback is another slot variable, computes to nothing on every site
 * that never pressed the button — the whole customer base, not only the ones who chose a system.
 * Also judged: the role named exists (a misspelt `--ds-c-backgrond` is never defined by any system):
 * the slot's colour tokens and every colour of the standard role variables (`role-variables.mjs`,
 * all emitted since 15/10/2026: `--ds-c-ink`, `--ds-c-heading`, `--ds-c-focus-ring`, the status shades).
 *
 * A bare read inside a template's OWN custom property (`--kds-accent-8: color-mix(in srgb,
 * var(--ds-c-accent) 8%, transparent)`) is kept too when every read of that property carries the
 * template's own value (`var(--kds-accent-8, rgba(163, 230, 53, .08))`): with no system worn the bare
 * read makes the property invalid at computed-value time, so each read falls back to the template's
 * value (JA Kinetic Joomla 1.0.8, 16/10/2026: its accent tints and ink shades are written so).
 *
 * A read in a rule gated on the worn scope (`:root:has(#tracy-ds-slot) .x`, `readers/worn-scope.js`)
 * needs no fallback, and neither does a read of a template property there: the rule never matches on
 * a site that wears no system, so it cannot change the default look (batch 2, 18/10/2026).
 */
import { dsSlotModule } from '../../ds-slot.js'
import { releaseFiles, stylesheetsOf } from '../readers/release-files.js'
import { inWornScope } from '../readers/worn-scope.js'

/** The text after `var(` up to its own closing bracket, or null when it never closes. */
function argsAt(/** @type {string} */ css, /** @type {number} */ open) {
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '(') depth += 1
    else if (css[i] === ')') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return null
}

/** The first comma outside brackets, or -1. */
function topComma(/** @type {string} */ s) {
  let depth = 0
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1
    else if (s[i] === ')') depth -= 1
    else if (s[i] === ',' && depth === 0) return i
  }
  return -1
}

/**
 * Whether a fallback ends in a value of the template's own: a plain value, or another slot read
 * whose own fallback does (`var(--ds-size-display-phone, var(--ds-size-display, clamp(…)))`, the
 * EmDash themes' phone sizes).
 */
function ownValue(/** @type {string} */ fallback) {
  const f = fallback.trim()
  if (f === '') return false
  const inner = /^var\(\s*--ds-[\w-]+/.exec(f)
  if (!inner) return true
  const args = argsAt(f, 3)
  if (args === null) return false
  const comma = topComma(args)
  return comma >= 0 && ownValue(args.slice(comma + 1))
}

/** The custom property whose declaration holds the text at `at`, or null (a declaration of a CSS property). */
function declaredProperty(/** @type {string} */ css, /** @type {number} */ at) {
  let depth = 0
  for (let i = at - 1; i >= 0; i -= 1) {
    const c = css[i]
    if (c === ')') depth += 1
    else if (c === '(') depth -= 1
    else if (depth <= 0 && (c === ';' || c === '{' || c === '}')) {
      const m = /^\s*(--[\w-]+)\s*:/.exec(css.slice(i + 1, at))
      return m ? m[1] : null
    }
  }
  const m = /^\s*(--[\w-]+)\s*:/.exec(css.slice(0, at))
  return m ? m[1] : null
}

/**
 * Whether every read of the custom property `name` in the sheets carries a fallback of the
 * template's own, or sits in a rule that applies only while a system is worn.
 */
function everyReadFallsBack(/** @type {[string, string][]} */ sheets, /** @type {string} */ name) {
  const re = new RegExp(`var\\(\\s*${name.replace(/[-]/g, '\\-')}(?![\\w-])`, 'g')
  let seen = 0
  for (const [, raw] of sheets) {
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(re)) {
      const args = argsAt(css, /** @type {number} */ (m.index) + 3)
      if (args === null) return false
      const comma = topComma(args)
      const kept = comma >= 0 && ownValue(args.slice(comma + 1))
      if (!kept && !inWornScope(css, /** @type {number} */ (m.index))) return false
      seen += 1
    }
  }
  return seen > 0
}

/** @type {import('../index.js').Rule} */
export const def1DefaultLookKept = {
  id: 'DEF-1',
  title: 'With no system worn, the template looks as released',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'template',
  async run(context) {
    const { COLOUR_TOKENS } = await dsSlotModule('tokens56')
    const { ROLE_VARIABLES } = await dsSlotModule('role-variables')
    const roles = new Set([
      ...COLOUR_TOKENS,
      'accent-text',
      'accent-text-hover',
      ...ROLE_VARIABLES.filter((/** @type {any} */ r) => r.kind === 'color').map((/** @type {any} */ r) =>
        String(r.name).replace(/^--ds-c-/, '')
      )
    ])
    const sheets = stylesheetsOf(await releaseFiles(context))
    /** @type {Map<string, boolean>} a template property declared from a bare read: is every read of it kept */
    const guarded = new Map()
    /** @type {string[]} */
    const bare = []
    /** @type {string[]} */
    const unknown = []
    let reads = 0
    for (const [file, raw] of sheets) {
      const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of css.matchAll(/var\(\s*(--ds-[\w-]+)/g)) {
        const args = argsAt(css, /** @type {number} */ (m.index) + 3)
        if (args === null) continue
        reads += 1
        const name = m[1]
        const comma = topComma(args)
        // A read nested in another read's fallback is judged with it, once, from the outermost.
        const before = css.slice(Math.max(0, /** @type {number} */ (m.index) - 40), m.index)
        if (/,\s*$/.test(before) && /var\(\s*--ds-[\w-]+\s*,\s*$/.test(before)) {
          reads -= 1
          continue
        }
        const fallback = comma < 0 ? '' : args.slice(comma + 1)
        if (!ownValue(fallback) && !inWornScope(css, /** @type {number} */ (m.index))) {
          const prop = declaredProperty(css, /** @type {number} */ (m.index))
          if (prop && !prop.startsWith('--ds-')) {
            if (!guarded.has(prop)) guarded.set(prop, everyReadFallsBack([...sheets], prop))
            if (!guarded.get(prop)) bare.push(`${file}: ${name} (in ${prop})`)
          } else bare.push(`${file}: ${name}`)
        }
        const colour = /^--ds-c-([\w-]+)$/.exec(name)?.[1] ?? /^--ds-a-([\w-]+?)-\d{1,3}$/.exec(name)?.[1]
        if (colour && !roles.has(colour)) unknown.push(`${file}: ${name}`)
      }
    }
    if (reads === 0)
      return { status: 'pass', message: 'No stylesheet reads a slot variable, so nothing depends on one.' }
    const firstOf = (/** @type {string[]} */ list) => [...new Set(list)].slice(0, 6).join('; ')
    if (bare.length > 0 || unknown.length > 0)
      return {
        status: 'fail',
        message: [
          bare.length > 0
            ? `${bare.length} slot read${bare.length === 1 ? ' has' : 's have'} no fallback of the template's own, so sites that wear no system lose that value (${firstOf(bare)})`
            : '',
          unknown.length > 0
            ? `${unknown.length} read${unknown.length === 1 ? 's a role' : ' roles'} no system defines (${firstOf(unknown)})`
            : ''
        ]
          .filter(Boolean)
          .join('. ')
          .concat('.'),
        fix: "Give every var(--ds-…) the template's own value as its fallback (the tokenizer writes it: tokenize the released stylesheet again instead of editing by hand), and use only the 16 colour roles.",
        details: [...new Set([...bare, ...unknown])]
      }
    return {
      status: 'pass',
      message: `All ${reads} slot reads keep the template's own value as their fallback.`
    }
  }
}
