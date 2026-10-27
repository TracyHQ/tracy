// The grounds the auto palette paints and the words it sets on them read on every side of every
// system: under Figma dark, WordPress Tracy Base's numbered step circles (.bg-accent .text-accent-on)
// took the dark band and the band's words, both near-black, and lost their digits (15/10/2026). A small
// accent-filled chip read through the accent preset is the accent, never a band. The Joomla Tracy Base
// landing takes the page ground for its layout and the system's accent ramp for its chart bars.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { autoPaletteCss, classifyPalette, roleValues } from '../src/auto-palette.mjs'
import { contrast, luminance, mix, parseHex, toHex } from '../src/colour.mjs'
import { derive, modeOf } from '../src/derive.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { SIDE, sidesOf } from '../src/sides.mjs'
import { wordpressVariation, wpKebab } from '../src/wordpress.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const SYSTEMS = {
  moxie: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  figma: 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671',
  stripe: 'od:stripe',
  spotify: 'od:spotify',
  apple: 'od:apple'
}
const PALETTE_CONTRACTS = readdirSync(resolve(HERE, '../templates'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((n) => /^(joomla|wordpress)-/.test(n))
  .filter((n) => loadContract(n).autoPalette)
const PAIRS = [
  ['band', 'on-band'],
  ['accent', 'on-accent']
]

/** The top-level rules of a sheet (no @media), as [selector, body]. */
function topRules(css) {
  const out = []
  let depth = 0
  let start = 0
  let sel = ''
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) {
        sel = css.slice(start, i)
        start = i + 1
      }
      depth++
    } else if (css[i] === '}') {
      depth--
      if (depth === 0) {
        out.push([sel.replace(/\/\*[\s\S]*?\*\//g, '').trim(), css.slice(start, i)])
        start = i + 1
      }
    }
  }
  return out
}

/** The variables of the rules whose first selector matches `pick`. */
function varsOf(css, pick) {
  const vars = {}
  for (const [sel, body] of topRules(css)) {
    if (sel.startsWith('@') || !pick(sel.split(',')[0].trim())) continue
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) vars[m[1]] = m[2].trim()
  }
  return vars
}

/** The arguments of a CSS function call, split at its top-level commas. */
function args(inner) {
  const out = []
  let depth = 0
  let cur = ''
  for (const c of inner) {
    if (c === '(') depth++
    else if (c === ')') depth--
    if (c === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  out.push(cur.trim())
  return out
}

/** A colour value (var(), light-dark(), color-mix(in srgb, …)) resolved to a hex on one side. */
function resolveColour(value, vars, scheme, depth = 0) {
  const v = String(value ?? '').trim()
  if (depth > 20) return null
  if (parseHex(v)) return toHex(parseHex(v))
  const call = /^([a-z-]+)\(([\s\S]*)\)$/i.exec(v)
  if (!call) return null
  const [, fn, inner] = call
  const a = args(inner)
  if (fn === 'var') return resolveColour(vars[a[0]] ?? a[1], vars, scheme, depth + 1)
  if (fn === 'light-dark') return resolveColour(scheme === 'dark' ? a[1] : a[0], vars, scheme, depth + 1)
  if (fn === 'color-mix') {
    const part = (s) => {
      const m = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(s)
      return m ? [m[1], Number(m[2]) / 100] : [s, null]
    }
    const [x, px] = part(a[1])
    const [y, py] = part(a[2])
    const p = px ?? (py === null ? 0.5 : 1 - py)
    const cx = resolveColour(x, vars, scheme, depth + 1)
    const cy = resolveColour(y, vars, scheme, depth + 1)
    return cx && cy ? mix(cy, cx, p) : null
  }
  return null
}

/** Each side of one contract's sheet under one system: { light, dark } of raw variables. */
function sheetSides(name, profile) {
  const c = loadContract(name)
  const write = (p) => {
    const base = contractBase(ROOT, c)
    let css
    let presets = {}
    if (name.startsWith('joomla-')) {
      const r = joomlaSlot(p, base, c)
      if ('refused' in r) return null
      css = r.css
    } else {
      const r = wordpressVariation(p, base, c)
      if ('refused' in r) return null
      css = r.css
      presets = Object.fromEntries(
        (r.variation.settings?.color?.palette ?? []).map((x) => [
          `--wp--preset--color--${wpKebab(x.slug)}`,
          x.color
        ])
      )
    }
    // each side as the contract scopes it (sidesOf: JA Kinetic WP marks its dark side with two marks)
    const side = sidesOf(c)
    const root = (attr) => (first) =>
      /^(:root|html)\S*$/.test(first) &&
      (attr === null
        ? !first.includes(side.dark) && !first.includes(':where(:not([data-theme]))')
        : first.includes(attr))
    if (c.modes === true)
      return {
        light: { ...presets, ...varsOf(css, root(side.light)) },
        dark: { ...presets, ...varsOf(css, root(side.dark)) },
        css
      }
    return { [modeOf(p)]: { ...presets, ...varsOf(css, root(null)) }, css }
  }
  const own = write(profile)
  if (!own) return null
  for (const scheme of ['light', 'dark'])
    if (!own[scheme]) {
      const d = write(derive(profile, scheme).profile)
      if (d?.[scheme]) own[scheme] = d[scheme]
    }
  return own
}

test('every ground the auto palette paints and the words it sets on it read 4.5:1, both sides of every system', () => {
  const v = roleValues()
  const failures = []
  let checked = 0
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const profile = loadProfile(ROOT, id)
    for (const name of PALETTE_CONTRACTS) {
      const s = sheetSides(name, profile)
      if (!s) continue
      for (const scheme of ['light', 'dark']) {
        if (!s[scheme]) continue
        checked++
        for (const [ground, words] of PAIRS) {
          const g = resolveColour(v[ground], s[scheme], scheme)
          const w = resolveColour(v[words], s[scheme], scheme)
          const k = contrast(w, g)
          if (!(k >= 4.5))
            failures.push(`${name} ${key} ${scheme}: ${words} ${w} on ${ground} ${g} = ${k?.toFixed(2)}`)
        }
      }
    }
  }
  assert.ok(checked >= PALETTE_CONTRACTS.length * 2, `only ${checked} sides checked`)
  assert.deepEqual(failures, [], `${failures.length} failures of ${checked} sides`)
})

test('a ground read through the system accent is the accent, its words the accent words, never a band', () => {
  const c = loadContract('wordpress-tracy-base')
  const css = autoPaletteCss(c.autoPalette, { hi: ':root' })
  const v = roleValues()
  // the step circles of Tracy Base: .bg-accent fills, .text-accent-on writes the digits
  for (const [sel, body] of topRules(css)) {
    const parts = sel.split(',').map((x) => x.trim())
    if (parts.includes(':root .bg-accent'))
      assert.ok(!body.includes(v.band), `.bg-accent painted as a band: ${body}`)
    if (parts.includes(':root .text-accent-on'))
      assert.ok(!body.includes(v['on-band']), `.text-accent-on given the band words: ${body}`)
  }
  // classified afresh: a fill read through the accent preset is the accent, wherever its hex grounds a band
  const probe = {
    page: '#ffffff',
    pageArea: 1000,
    rules: [
      ['.bg-accent', 'background-color', '#0071e3', 0, null, '--wp--preset--color--accent'],
      ['.text-accent-on', 'color', '#ffffff', 0, '#0071e3', '--wp--preset--color--accent-on']
    ],
    vars: {},
    inline: {},
    use: { '#0071e3': { area: 900, text: 0, grounds: {}, border: 0, wide: true } }
  }
  const out = classifyPalette(probe)
  assert.equal(out.rules[0][2], 'accent')
  assert.equal(out.rules[1][2], 'on-accent')
})

/** The landing scope's variables on one side of the Joomla Tracy Base sheet, with the side's tokens. */
function landingSide(css, attr) {
  return {
    ...varsOf(css, (first) => /^(:root|html)\S*$/.test(first) && first.includes(attr)),
    ...varsOf(css, (first) => first.includes(attr) && first.endsWith('.tracy-native-landing'))
  }
}

test('Joomla Tracy Base: the landing layout is the page ground, its palette steps the system accent ramp, both sides', () => {
  const c = loadContract('joomla-tracy-base')
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const r = joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, c), c)
    assert.ok(!('refused' in r), key)
    for (const scheme of ['light', 'dark']) {
      const at = `${key} ${scheme}`
      const vars = landingSide(r.css, SIDE[scheme])
      const page = resolveColour('var(--bg)', vars, scheme)
      assert.equal(
        resolveColour('var(--brand-color-bg-layout)', vars, scheme),
        page,
        `${at}: layout is not the page`
      )
      const accent = resolveColour('var(--accent)', vars, scheme)
      const steps = Array.from({ length: 10 }, (_, i) =>
        resolveColour(`var(--brand-primary-palette-${i + 1})`, vars, scheme)
      )
      assert.ok(
        steps.every((x) => parseHex(x)),
        `${at}: palette steps missing ${steps}`
      )
      assert.equal(steps[5], accent, `${at}: step 6 is not the accent`)
      // light→dark on a light page, dark→light on a dark one, like the template's own two ramps
      const l = steps.map((x) => luminance(parseHex(x)))
      const falling = scheme === 'light'
      for (let i = 1; i < 10; i++)
        assert.ok(
          falling ? l[i] <= l[i - 1] + 1e-9 : l[i] >= l[i - 1] - 1e-9,
          `${at}: step ${i + 1} out of order ${steps}`
        )
    }
  }
})
