// The grounds a template paints and the words set on them are worn as pairs, on every CMS emitter,
// both schemes, whatever the contract mentions: ink and on-ink (and the accent on ink), the accent
// band and its words, the accent and its words. Before, the WordPress and Joomla sheets wrote ink as a
// reference to the strongest text colour and computed on-ink for another ink, so under Moxie dark JA
// Kinetic's ink ticker band turned cream with cream words (15/10/2026).
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast } from '../src/colour.mjs'
import { DISABLED } from '../src/role-values.mjs'
import { derive, modeOf } from '../src/derive.mjs'
import { emdashCss } from '../src/emit.mjs'
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
  spotify: 'od:spotify'
}
const CONTRACTS = readdirSync(resolve(HERE, '../templates'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((n) => /^(joomla|wordpress|emdash)-/.test(n))
const TEXT_ROLES = ['fg', 'heading', 'fg-2', 'muted', 'meta']
const PAIRS = [
  ['on-ink', 'ink'],
  ['accent-on-ink', 'ink'],
  ['on-accent-band', 'accent-band'],
  ['accent-on', 'accent']
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

/** The declarations of the root rules of one side (`attr` in the selector, or any when null). */
function rootVars(css, attr) {
  const vars = {}
  for (const [sel, body] of topRules(css)) {
    if (sel.startsWith('@')) continue
    const first = sel.split(',')[0].trim()
    // a side hook may hold spaces (JA's :has(> body.dark-active)): judged with the hook taken out
    if (!/^(:root|html)\S*$/.test(attr ? first.replace(attr, '') : first)) continue
    // a one-look sheet writes one side, unscoped or kept off the template's own dark switch
    const own = !first.includes(SIDE.dark) && !first.includes(':where(:not([data-theme]))')
    if (attr === null ? !own : !first.includes(attr)) continue
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) vars[m[1]] = m[2].trim()
  }
  return vars
}

/** A value with every var() resolved against `vars`. */
function resolveVar(value, vars, seen = 0) {
  const m = /^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/.exec(String(value ?? '').trim())
  if (!m || seen > 10) return value
  return resolveVar(vars[m[1]] ?? m[2], vars, seen + 1)
}

/** One side's worn roles, by name without `--ds-c-`, resolved to literals. */
function roles(vars) {
  const o = {}
  for (const k of Object.keys(vars))
    if (k.startsWith('--ds-c-')) o[k.slice('--ds-c-'.length)] = resolveVar(vars[k], vars)
  return o
}

/** Both schemes of one contract under one system: { light, dark } of resolved roles, or null when refused. */
function sides(name, profile) {
  const c = loadContract(name)
  const write = (p) => {
    if (name.startsWith('emdash-')) {
      const r = emdashCss(p, c)
      if ('refused' in r) return null
      const other = r.mode === 'dark' ? 'light' : 'dark'
      return { [r.mode]: r.vars, [other]: r.derivedVars }
    }
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
    if (c.modes === true) {
      // the contract's own switch (data-theme, or a body class such as JA's dark-active)
      const side = sidesOf(c)
      return {
        light: { ...presets, ...rootVars(css, side.light) },
        dark: { ...presets, ...rootVars(css, side.dark) }
      }
    }
    return { [modeOf(p)]: { ...presets, ...rootVars(css, null) } }
  }
  const own = write(profile)
  if (!own) return null
  // a one-look contract wears one side per system: the derived side is worn under the derived system
  const out = {}
  for (const [scheme, v] of Object.entries(own)) out[scheme] = roles(v)
  for (const scheme of ['light', 'dark'])
    if (!out[scheme]) {
      const d = write(derive(profile, scheme).profile)
      if (d?.[scheme]) out[scheme] = roles(d[scheme])
    }
  return out
}

test('every CMS emitter wears ink, the accent band and the accent with words that read on them, both schemes', () => {
  const failures = []
  let checked = 0
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const profile = loadProfile(ROOT, id)
    for (const name of CONTRACTS) {
      const s = sides(name, profile)
      if (!s) continue
      for (const [scheme, v] of Object.entries(s)) {
        checked++
        const at = `${name} ${key} ${scheme}`
        for (const [words, ground] of PAIRS) {
          const k = contrast(v[words], v[ground])
          if (!(k >= 4.5))
            failures.push(`${at}: ${words} ${v[words]} on ${ground} ${v[ground]} = ${k?.toFixed(2)}`)
        }
        // ink is a ground: never the words set on it, and on a dark side never one of the side's text
        // colours (on a light side the template's dark band takes the system's text colour by design)
        if (String(v.ink).toLowerCase() === String(v['on-ink']).toLowerCase())
          failures.push(`${at}: ink ${v.ink} is on-ink`)
        if (scheme === 'dark')
          for (const r of TEXT_ROLES)
            if (v[r] && String(v.ink).toLowerCase() === String(v[r]).toLowerCase())
              failures.push(`${at}: ink ${v.ink} is the text role ${r}`)
      }
    }
  }
  assert.ok(checked >= CONTRACTS.length * 2, `only ${checked} sides checked`)
  assert.deepEqual(failures, [], `${failures.length} failures of ${checked} sides`)
})

test('a disabled control stands apart from every ground it sits on and its words read 3:1 there, every CMS, both schemes', () => {
  // /contact's Send request before the consent tick, Tracy Business WordPress under Moxie dark: the
  // disabled fill sat 1.03:1 on the card it is drawn on, only a faint word left (15/10/2026). The grounds
  // a control sits on are the page and the card; a sheet's warm surface may be another role by contract
  // (GK Compact Joomla writes it as the accent)
  const failures = []
  let checked = 0
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const profile = loadProfile(ROOT, id)
    for (const name of CONTRACTS) {
      const s = sides(name, profile)
      if (!s) continue
      for (const [scheme, v] of Object.entries(s)) {
        checked++
        const at = `${name} ${key} ${scheme}`
        for (const ground of ['bg', 'surface']) {
          if (!v[ground]) continue
          const fill = contrast(v['disabled-bg'], v[ground])
          if (!(fill >= DISABLED.apart))
            failures.push(
              `${at}: disabled-bg ${v['disabled-bg']} on ${ground} ${v[ground]} = ${fill?.toFixed(2)}`
            )
        }
        for (const ground of ['disabled-bg', 'bg', 'surface']) {
          if (!v[ground]) continue
          const words = contrast(v['disabled-fg'], v[ground])
          if (!(words >= DISABLED.words))
            failures.push(
              `${at}: disabled-fg ${v['disabled-fg']} on ${ground} ${v[ground]} = ${words?.toFixed(2)}`
            )
        }
      }
    }
  }
  assert.ok(checked >= CONTRACTS.length * 2, `only ${checked} sides checked`)
  assert.deepEqual(failures, [], `${failures.length} failures of ${checked} sides`)
})

test('a field reads on its fill: the muted placeholder and the text on the surface, every CMS, both schemes', () => {
  // Tracy Business WordPress's subscribe field wears the surface, the text and the muted words under a
  // system; its placeholder read 1.3:1 on the accent's pressed shade before (Moxie dark, 15/10/2026)
  const failures = []
  let checked = 0
  for (const [key, id] of Object.entries(SYSTEMS)) {
    const profile = loadProfile(ROOT, id)
    for (const name of CONTRACTS) {
      const s = sides(name, profile)
      if (!s) continue
      for (const [scheme, v] of Object.entries(s)) {
        checked++
        for (const words of ['muted', 'fg']) {
          const k = contrast(v[words], v.surface)
          if (!(k >= 4.5))
            failures.push(
              `${name} ${key} ${scheme}: ${words} ${v[words]} on surface ${v.surface} = ${k?.toFixed(2)}`
            )
        }
      }
    }
  }
  assert.ok(checked >= CONTRACTS.length * 2, `only ${checked} sides checked`)
  assert.deepEqual(failures, [], `${failures.length} failures of ${checked} sides`)
})
