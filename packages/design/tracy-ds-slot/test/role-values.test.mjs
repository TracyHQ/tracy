// Every standard role variable (role-variables.mjs) is emitted by every CMS emitter, on both sides of
// light, with values derived from the system's own tokens: lines visible but quiet, surfaces apart
// from the page, a button on the accent band that stands out, and every colour pair a role implies
// readable at WCAG AA (review stand, Moxie and Figma on EmDash Tracy Business and Base, 15/10/2026).
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast } from '../src/colour.mjs'
import { emdashCss } from '../src/emit.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { ROLE_VARIABLE_NAMES, missingRoleVariables, REQUIRED_ROLE_VARIABLES } from '../src/role-variables.mjs'
import { SURFACE_HOVER, surfaceHoverOf } from '../src/role-values.mjs'
import { wordpressVariation } from '../src/wordpress.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SYSTEMS = {
  moxie: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  figma: 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671',
  stripe: 'od:stripe',
  spotify: 'od:spotify'
}
// the role-reading line of each EmDash theme (from Tracy Business 1.7.20, Tracy Base 0.5.5)
const ROLE_READERS = ['emdash-tracy-business-roles', 'emdash-base-roles']

/** Both sides of an EmDash sheet's variables, by scheme. */
function sides(id, contractName) {
  const r = emdashCss(loadProfile(ROOT, id), loadContract(contractName))
  assert.ok(!('refused' in r), `${id} refused`)
  const other = r.mode === 'dark' ? 'light' : 'dark'
  return { [r.mode]: r.vars, [other]: r.derivedVars }
}

/** The `--ds-*` names a sheet declares. */
const declared = (css) => new Set([...css.matchAll(/(--ds-[\w-]+)\s*:/g)].map((m) => m[1]))

test('the EmDash emitter writes every role variable on both sides, for every EmDash contract', () => {
  for (const name of [
    'emdash-tracy-business',
    'emdash-tracy-business-roles',
    'emdash-base',
    'emdash-base-roles',
    'emdash-tracy-saas'
  ])
    for (const id of Object.values(SYSTEMS))
      for (const [scheme, vars] of Object.entries(sides(id, name))) {
        const missing = ROLE_VARIABLE_NAMES.filter((n) => !vars[n])
        assert.deepEqual(missing, [], `${name} ${id} ${scheme}`)
      }
})

test('the Joomla and WordPress emitters write every role variable', () => {
  for (const id of [SYSTEMS.moxie, SYSTEMS.figma]) {
    const p = loadProfile(ROOT, id)
    for (const name of ['joomla-tracy-business', 'joomla-ja-kinetic']) {
      const c = loadContract(name)
      const css = joomlaSlot(p, contractBase(ROOT, c), c).css
      const has = declared(css)
      assert.deepEqual(
        ROLE_VARIABLE_NAMES.filter((n) => !has.has(n)),
        [],
        `${name} ${id}`
      )
    }
    for (const name of ['wordpress-tracy-business', 'wordpress-ja-kinetic']) {
      const c = loadContract(name)
      const css = wordpressVariation(p, contractBase(ROOT, c), c).css
      const has = declared(css)
      assert.deepEqual(
        ROLE_VARIABLE_NAMES.filter((n) => !has.has(n)),
        [],
        `${name} ${id}`
      )
    }
  }
})

/** Every text pair a role implies: [text role, ground role]. */
const TEXT_PAIRS = [
  ['fg', 'bg'],
  ['fg', 'surface'],
  ['fg', 'surface-hover'],
  ['heading', 'bg'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['accent-text', 'bg'],
  ['accent-on', 'accent'],
  ['accent-on', 'accent-hover'],
  ['on-ink', 'ink'],
  ['on-accent-band', 'accent-band'],
  ['success-text', 'success-bg'],
  ['warn-text', 'warn-bg'],
  ['danger-text', 'danger-bg'],
  ['info-text', 'info-bg'],
  ['success-text', 'bg'],
  ['warn-text', 'bg'],
  ['danger-text', 'bg'],
  ['info-text', 'bg']
]

test('every colour pair a role implies reads at WCAG AA, both schemes, four systems', () => {
  for (const [key, id] of Object.entries(SYSTEMS))
    for (const name of ROLE_READERS)
      for (const [scheme, v] of Object.entries(sides(id, name)))
        for (const [text, ground] of TEXT_PAIRS) {
          const r = contrast(v[`--ds-c-${text}`], v[`--ds-c-${ground}`])
          assert.ok(
            r >= 4.5,
            `${key} ${name} ${scheme}: ${text} ${v[`--ds-c-${text}`]} on ${ground} ${v[`--ds-c-${ground}`]} = ${r?.toFixed(2)}`
          )
        }
})

test('a button on the accent band and on the ink band stands out (3:1), and its words read', () => {
  for (const [key, id] of Object.entries(SYSTEMS))
    for (const [scheme, v] of Object.entries(sides(id, 'emdash-tracy-business-roles'))) {
      const onBand = contrast(v['--ds-c-accent'], v['--ds-c-accent-band'])
      assert.ok(onBand >= 3, `${key} ${scheme}: accent button on the accent band ${onBand.toFixed(2)}`)
      // the turned-over pair a template may draw there instead (Tracy Base's call band)
      const turned = contrast(v['--ds-c-on-accent-band'], v['--ds-c-accent-band'])
      assert.ok(turned >= 3, `${key} ${scheme}: on-accent-band fill on the band ${turned.toFixed(2)}`)
      const onInk = contrast(v['--ds-c-accent'], v['--ds-c-ink'])
      assert.ok(onInk >= 3, `${key} ${scheme}: accent button on the ink band ${onInk.toFixed(2)}`)
    }
})

test('lines are visible but quiet, and the surface stands apart from the page', () => {
  for (const [key, id] of Object.entries(SYSTEMS))
    for (const [scheme, v] of Object.entries(sides(id, 'emdash-tracy-business-roles'))) {
      const bg = v['--ds-c-bg']
      const border = contrast(v['--ds-c-border'], bg)
      const soft = contrast(v['--ds-c-border-soft'], bg)
      assert.ok(
        border >= 1.9 && border <= 3.2,
        `${key} ${scheme}: border ${v['--ds-c-border']} ${border.toFixed(2)}`
      )
      assert.ok(
        soft >= 1.25 && soft <= 2.05,
        `${key} ${scheme}: border-soft ${v['--ds-c-border-soft']} ${soft.toFixed(2)}`
      )
      assert.ok(soft < border, `${key} ${scheme}: the soft line is quieter than the line`)
      assert.notEqual(v['--ds-c-border-soft'], v['--ds-c-fg'])
      assert.notEqual(v['--ds-c-border'], v['--ds-c-fg'])
      const lift = contrast(v['--ds-c-surface'], bg)
      assert.ok(lift >= 1.05, `${key} ${scheme}: surface ${v['--ds-c-surface']} on ${bg} ${lift.toFixed(3)}`)
      assert.ok(contrast(v['--ds-c-focus-ring'], bg) >= 3, `${key} ${scheme}: focus ring`)
      assert.ok(contrast(v['--ds-c-disabled-fg'], v['--ds-c-disabled-bg']) >= 3, `${key} ${scheme}: disabled`)
    }
})

test('the fonts and corners are roles too: body face, heading face, mono, field corner', () => {
  const v = sides(SYSTEMS.figma, 'emdash-tracy-business-roles').light
  assert.match(v['--ds-font-body'], /Inter/)
  assert.match(v['--ds-font-heading'], /Inter/)
  assert.match(v['--ds-font-mono'], /JetBrains Mono/)
  // Figma states no field corner: the smaller of its button (50) and card (16) corners
  assert.equal(v['--ds-input-radius'], '16px')
})

test('the templates that read roles carry no per-template patches, and their sheet writes none', () => {
  for (const name of ROLE_READERS) {
    const c = loadContract(name)
    for (const k of ['status', 'bandButtons', 'templateVars', 'omit', 'fontVars'])
      assert.equal(c[k], undefined, `${name} still carries ${k}`)
    // a release that gives a few places the wrong role may name them (followRules, shapeRules): left out here
    const { followRules: _follow, shapeRules: _shape, ...bare } = c
    const css = emdashCss(loadProfile(ROOT, SYSTEMS.moxie), bare).css
    assert.doesNotMatch(css, /:root :is\(/, `${name}: a follow or shape rule`)
    // no button or shape rule on a band; Tracy Business keeps bandText (accent words on its ink band), a colour only
    assert.doesNotMatch(css, /\.btn|background-color:|border-radius:/, `${name}: a band button or shape rule`)
    // the template's own colour family is not written over: it reads the roles itself
    assert.doesNotMatch(css, /--color-(bg|fg|line|surface|accent)[\w-]*:/, `${name}: a --color-* variable`)
    assert.doesNotMatch(css, /--font-sans:/, `${name}: --font-sans instead of --ds-font-body`)
  }
})

test('a role reader names the places its release mis-roles: a role colour and a corner token, on both sides', () => {
  // Tracy Business EmDash 1.7.22 (probe v10, 18/10/2026): the kit form's step labels in the ink band's meta
  // words on the card (CON-2), its marks in the accent band a dark system sinks (LAYOUT-3), the header's
  // square search button beside the pill call to action (BTN-1 row shape)
  const c = loadContract('emdash-tracy-business-roles')
  const { css, vars, derivedVars } = emdashCss(loadProfile(ROOT, SYSTEMS.figma), c)
  for (const v of [vars, derivedVars]) {
    const meta = v['--ds-c-meta']
    const fg = v['--ds-c-fg']
    assert.ok(meta && fg)
    assert.ok(
      css.includes(`.border-line.text-on-ink-meta, .bg-paper > .text-on-ink-meta) { color: ${meta}; }`)
    )
    assert.ok(css.includes(`:is(span.shrink-0.bg-forest:empty) { background-color: ${fg}; }`))
    // the header's call to action: the readable accent text with the page's words, apart from the page
    // where the accent band is not (Figma dark #151444 on #141414, 1.07:1)
    const text = v['--ds-c-accent-text']
    const bg = v['--ds-c-bg']
    assert.ok(css.includes(`:is(.bg-paper a.btn-forest) { background-color: ${text}; color: ${bg}; }`))
    assert.ok(contrast(text, bg) >= 4.5)
  }
  assert.match(css, /:root\[data-theme="dark"\] :is\(span\.shrink-0\.bg-forest:empty\)/)
  assert.match(css, /:is\(header a\[href\$="\/search"\]\) \{ border-radius: var\(--ds-btn-radius\); \}/)
  // still nothing over the template's own colour family
  assert.doesNotMatch(css, /--color-(bg|fg|line|surface|accent)[\w-]*:/)
})

test('the releases before the role line keep their template patches: the contract and the sheet it writes', () => {
  // Tracy Business 1.7.6 to 1.7.19 and Tracy Base 0.5.0 to 0.5.4 paint with their own --color-* family and
  // literals, so a site still built from one of them wears a system only through these patches
  const business = loadContract('emdash-tracy-business')
  assert.equal(business.readsRoles, undefined)
  for (const k of ['followRules', 'shapeRules', 'status', 'bandButtons', 'templateVars', 'omit', 'fontVars'])
    assert.ok(business[k], `emdash-tracy-business keeps ${k}`)
  const css = emdashCss(loadProfile(ROOT, SYSTEMS.moxie), business).css
  assert.match(css, /--color-forest:/, 'its colour family (templateVars)')
  assert.match(css, /--color-error:/, 'its status colours')
  assert.match(css, /\.bg-forest \.btn-primary \{ background-color:/, 'its band buttons')
  assert.match(
    css,
    /:is\(\.ec-form \.ec-form-submit, [^{]*\{ border-radius: var\(--ds-btn-radius\)/,
    'its shape rules'
  )
  assert.match(css, /:is\(\.link-underline\) \{ border-color:/, 'its follow rules')
  const base = loadContract('emdash-base')
  assert.equal(base.readsRoles, undefined)
  assert.ok(base.templateVars && base.followRules)
  assert.match(
    emdashCss(loadProfile(ROOT, SYSTEMS.moxie), base).css,
    /:is\(\[data-block="social-proof"\] \.text-warn-text\) \{ color:/
  )
})

test('the neutral hover ground stands a visible step off the surface, its text still reads (20/10/2026)', () => {
  for (const [key, id] of Object.entries(SYSTEMS))
    for (const name of ROLE_READERS)
      for (const [scheme, v] of Object.entries(sides(id, name))) {
        const step = contrast(v['--ds-c-surface-hover'], v['--ds-c-surface'])
        const want = contrast(v['--ds-c-bg'], '#000000') < 5 ? SURFACE_HOVER.dark : SURFACE_HOVER.light
        assert.ok(
          step >= want - 0.01,
          `${key} ${name} ${scheme}: surface-hover ${step.toFixed(3)} off the surface`
        )
      }
  // a system's own hover ground is kept when it stands apart and the text reads on it; one equal to the
  // surface is not a hover, and the step is taken instead
  assert.equal(surfaceHoverOf('#ffffff', '#ececec', '#111111', false), '#ececec')
  assert.notEqual(surfaceHoverOf('#ffffff', '#ffffff', '#111111', false), '#ffffff')
  assert.ok(
    contrast(surfaceHoverOf('#1e1e1e', null, '#f5f5f5', true), '#1e1e1e') >= SURFACE_HOVER.dark - 0.01
  )
  // optional: a quickstart that never reads it is complete without it (VARS-1)
  assert.ok(!REQUIRED_ROLE_VARIABLES.includes('--ds-c-surface-hover'))
  assert.deepEqual(missingRoleVariables(REQUIRED_ROLE_VARIABLES), [])
})

test('a Joomla module leaves out the optional roles its contract omits, and nothing else', () => {
  const p = loadProfile(ROOT, SYSTEMS.moxie)
  const impact = loadContract('joomla-ja-impact')
  assert.deepEqual(impact.omit, ['--ds-c-surface-hover'])
  const css = joomlaSlot(p, contractBase(ROOT, impact), impact).css
  assert.ok(!css.includes('--ds-c-surface-hover'), 'JA Impact: neither written nor reset in its kept bands')
  const has = declared(css)
  assert.deepEqual(
    ROLE_VARIABLE_NAMES.filter((n) => !has.has(n)),
    ['--ds-c-surface-hover']
  )
  // a required role in omit is written all the same
  const forced = { ...impact, omit: ['--ds-c-surface-hover', '--ds-c-bg'] }
  assert.ok(declared(joomlaSlot(p, contractBase(ROOT, forced), forced).css).has('--ds-c-bg'))
})
