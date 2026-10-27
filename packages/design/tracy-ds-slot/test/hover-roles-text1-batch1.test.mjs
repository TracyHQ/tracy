// HOVER-2 / HOVER-1 / BTN-1 on five released JA Joomla quickstarts (TEXT-1 batch 1, 21/10/2026): a :hover
// or :focus rule the template changes must take a role apart from its rest role on the worn page, and a
// button that showed a shape keeps one. Each case names the state rule the contract now writes and the
// role it carries; the rest rule beside it keeps a different one.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bandColours } from '../src/bands.mjs'
import { contrast, distance, mix } from '../src/colour.mjs'
import { derive, modeOf } from '../src/derive.mjs'
import { HOVER_SAME } from '../src/emit.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { gate } from '../src/normalise.mjs'
import { tokens56 } from '../src/tokens56.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SYSTEMS = ['refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671']

const sheetOf = (/** @type {string} */ name, /** @type {string} */ id) => {
  const c = loadContract(name)
  return joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, c), c).css
}

/** The declarations of every rule whose selector holds `part`, joined. */
const declsOf = (/** @type {string} */ css, /** @type {string} */ part, restOnly = false) => {
  const out = []
  for (let i = css.indexOf(part); i >= 0; i = css.indexOf(part, i + 1)) {
    // the rest rule: the part not followed by a state (`.chip` and never `.chip:hover`)
    if (restOnly && /^(:hover|:focus|:active|\.is-active)/.test(css.slice(i + part.length))) continue
    const open = css.indexOf('{', i)
    out.push(css.slice(open + 1, css.indexOf('}', open)))
  }
  assert.ok(out.length, `no rule names ${part}`)
  return out.join(' | ')
}

const CASES = [
  // [contract, a selector part of the state rule, what its declarations hold, a part of the rest rule, what the rest holds]
  [
    'joomla-ja-symphony',
    '.readmore .btn-readmore:hover',
    'var(--ds-c-accent-text-hover)!important',
    '.readmore .btn-readmore',
    'var(--ds-c-accent-text)'
  ],
  [
    'joomla-ja-kinetic-source',
    '.hx-blogtopics__chip:hover',
    'var(--ds-c-fg)!important',
    '.hx-blogtopics__chip',
    'var(--ds-c-fg-2)!important'
  ],
  ['joomla-ja-kinetic-source', '.hx-blogtopics__chip:is(:hover, :focus)', 'underline !important', null, null],
  [
    'joomla-ja-kinetic-source',
    '.hx-blogtopics__chip.is-active:hover',
    'var(--ds-c-accent-text-hover)!important',
    '.hx-blogtopics__chip.is-active',
    'var(--ds-c-accent-text)!important'
  ],
  [
    'joomla-ja-kinetic-source',
    '.hx-blogrow:is(:hover, :focus)',
    'color-mix(in srgb, var(--ds-c-fg) 8%, transparent) !important',
    null,
    null
  ],
  [
    'joomla-ja-symphony',
    '#t4-header .navbar-nav li:hover :is(.nav-link, .menu-item-title)',
    'underline !important',
    null,
    null
  ],
  ['joomla-ja-symphony', '.readmore .btn-readmore:is(:hover, :focus)', 'underline !important', null, null],
  ['joomla-ja-space', '#t3-header .item-129 a:is(:hover, :focus)', 'underline !important', null, null],
  [
    'joomla-ja-space',
    '#t3-header .navbar-default .navbar-nav > li > :is(a, span):is(:hover, :focus)',
    'underline !important',
    null,
    null
  ],
  // the project cards' titles show on the card's own :hover, which the probe's twin on the link and its
  // ancestors never reaches (the template's inherited a:hover colour does): the link's state underlines them
  [
    'joomla-ja-space',
    '.latest-project a:is(:hover, :focus) .intro-image span',
    'underline !important',
    null,
    null
  ],
  // the Home Light logo's hover reads the page text, within 3 channels of its kept #333 rest under some systems
  [
    'joomla-ja-space',
    '#t3-header:is(.itemid-128 *) .logo a:is(:hover, :focus) span',
    'underline !important',
    null,
    null
  ],
  [
    'joomla-ja-space',
    '.pagination > li > :is(a, span):is(:hover, :focus)',
    'underline !important',
    null,
    null
  ],
  ['joomla-ja-space', '.pagination > li > a:hover', 'var(--ds-c-surface-hover)', null, null],
  [
    'joomla-ja-space',
    '.latest-project .intro-image:hover span',
    'var(--ds-c-accent-on)',
    '.latest-project .intro-image span',
    'var(--ds-c-accent-text)'
  ],
  ['joomla-ja-sensei', '.btn-info', 'background:transparent !important', null, null],
  ['joomla-ja-sensei', '.btn-info:hover', 'var(--ds-c-info-bg)', null, null],
  ['joomla-ja-sensei', '.label-info[href]:hover', 'var(--ds-c-fg)', null, null],
  ['joomla-ja-sensei', '.label-info[href]:hover', 'underline !important', null, null],
  [
    'joomla-ja-impact',
    ':is(.t4-footer, .t4-footnav) a:not([class*=btn]):is(:hover, :focus)',
    'var(--ds-c-accent-on-ink)!important',
    null,
    null
  ],
  [
    'joomla-ja-impact',
    ':is(a.mod-articles-category-title:not(.btn), a[class*=video-btn]):is(:hover, :focus)',
    'var(--ds-c-fg)!important',
    null,
    null
  ],
  [
    'joomla-ja-impact',
    '.btn:is(.btn-white, .btn-arrow-right):is(:hover, :focus)',
    'background-color:var(--color-dark)!important',
    '.btn.btn-white:not(:hover):not(:active)',
    'var(--ds-c-accent-text)'
  ],
  [
    'joomla-ja-impact',
    ':is(.card-action, .contact-inner a):is(:hover, :focus) :is(.title, .contact-title)',
    'underline',
    null,
    null
  ],
  [
    'joomla-ja-impact',
    '.donation-layout .badge, a.mod-articles-category-title, a[class*=video-btn], .t4-footer a, .t4-footnav a, .item-content :is(h2, h4) a, .alert-link):is(:hover, :focus)',
    'underline',
    null,
    null
  ]
]

for (const [name, state, holds, rest, restHolds] of CASES)
  test(`${name}: ${state} takes a role apart from rest`, () => {
    for (const id of SYSTEMS) {
      const css = sheetOf(name, id)
      assert.match(
        declsOf(css, state),
        new RegExp(holds.replace(/[()[\]!.*+?^$|\\]/g, '\\$&')),
        `${id}: ${state}`
      )
      if (rest)
        assert.match(
          declsOf(css, rest, true),
          new RegExp(restHolds.replace(/[()[\]!.*+?^$|\\]/g, '\\$&')),
          `${id}: ${rest}`
        )
    }
  })

test('joomla-ja-space: the kept Home Light header states read a role on its white ground (HOVER-1)', () => {
  for (const id of SYSTEMS)
    assert.match(
      declsOf(sheetOf('joomla-ja-space', id), '#t3-header:is(.itemid-128 *) .item-129 a:hover'),
      /color:var\(--tracy-light-header-hover\) !important/
    )
})

// Every --ds-c-* is reset inside the kept header, so the role is read on the body, outside it: on the body itself,
// as the itemid class sits on <html>, which a rule under :root never names (written on .itemid-128, the alias was
// never set and the logo's hover fell back to an inherited grey, #9e9e9e on white under 5fd3, HOVER-1). What it
// holds must read on that header's ground (the Home Light hero's #fcfcfc, and white) under every system the
// library offers, on both sides, not only the two above: 4.5:1 on a light side, 3:1 on the white and on the page on a dark one.
test('joomla-ja-space: the Home Light header hover reads on its white ground under every system', () => {
  const c = loadContract('joomla-ja-space')
  const base = contractBase(ROOT, c)
  let n = 0
  let dim = 0
  for (const [kind, dir] of [
    ['refero', 'vendor/tracy/refero/systems'],
    ['od', 'vendor/tracy/od-design-system/systems']
  ])
    for (const key of readdirSync(join(ROOT, dir)).sort()) {
      let p
      try {
        p = loadProfile(ROOT, `${kind}:${key}`)
        if (!gate(p).ok) continue
      } catch {
        continue
      }
      n++
      for (const q of [p, derive(p, modeOf(p) === 'dark' ? 'light' : 'dark').profile]) {
        const at = `${kind}:${key} ${modeOf(q)}`
        const css = joomlaSlot(q, base, c).css
        const root = Object.fromEntries(
          [...(/:root\{([^}]*)\}/.exec(css)?.[1] ?? '').matchAll(/(--ds-c-[\w-]+):(#[0-9a-f]{6})/g)].map(
            (m) => [m[1], m[2]]
          )
        )
        assert.doesNotMatch(css, /[\s}]\.itemid-128\{/, `${at}: the alias on a descendant of <html>`)
        const alias = /\sbody:is\(\.itemid-128 \*\)\{--tracy-light-header-hover:([^;}]*)/.exec(css)?.[1]
        if (modeOf(q) === 'dark') {
          // the page 40% toward white: it reads on that white and on the dark page the hover probe sees behind
          // the photo (a dark side whose page is mid-tone or saturated has no colour that reads on both)
          assert.equal(alias, 'color-mix(in srgb, var(--ds-c-bg) 60%, #fff)', at)
          const colour = mix(root['--ds-c-bg'], '#ffffff', 0.4)
          if (contrast(colour, root['--ds-c-bg']) < 3 || contrast(colour, '#fcfcfc') < 3) dim++
          continue
        }
        const m = /^var\((--ds-c-[\w-]+)\)$/.exec(alias ?? '')
        assert.ok(m, `${at}: ${alias}`)
        const colour = root[m[1]]
        for (const g of ['#fcfcfc', '#ffffff'])
          assert.ok(contrast(colour, g) >= 4.5, `${at}: ${alias} = ${colour} on ${g}`)
      }
    }
  assert.ok(dim <= 6, `${dim} dark sides where the state reads under 3:1 on the white or the page`)
  assert.ok(n > 1000, `${n} systems`)
})

// The header sits on the hero photo: the band's second text is made to read on the black recorded under it, not on
// the photo, and read 4.08-4.3:1 there under every system (CON-1 on Moxie, 4.38:1 where the template's 80% white
// reads about 7.4:1, 21/10/2026). The menu keeps the template's own words at rest and on hover under every system
// (no colour rule names it); its hover and focus are told apart by the underline (CASES).
test('joomla-ja-space: no colour rule names the header menu under any system (CON-1 on the photo)', () => {
  const c = loadContract('joomla-ja-space')
  const base = contractBase(ROOT, c)
  let n = 0
  for (const [kind, dir] of [
    ['refero', 'vendor/tracy/refero/systems'],
    ['od', 'vendor/tracy/od-design-system/systems']
  ])
    for (const key of readdirSync(join(ROOT, dir)).sort()) {
      let p
      try {
        p = loadProfile(ROOT, `${kind}:${key}`)
        if (!gate(p).ok) continue
      } catch {
        continue
      }
      n++
      for (const rule of joomlaSlot(p, base, c).css.split('}')) {
        const [selector, decls = ''] = rule.split('{')
        if (/\.navbar-nav > (li|:is\([^)]*\)) >/.test(selector) && !selector.includes('.dropdown-menu'))
          assert.doesNotMatch(decls, /(^|;)color:/, `${kind}:${key}: ${selector}`)
      }
    }
  assert.ok(n > 1000, `${n} systems`)
})

// A state told apart by colour only must be apart under every system, not only the two above: rest and state are
// read per side (a two-mode template's derived side too), from the worn sheet's roles or the band's own colours
// (bands.mjs), and must differ by more than HOVER_SAME, the HOVER-2 detector's "same colour". A state told apart
// by a cue (an underline) is held by CASES above.
const PAIRS = {
  'joomla-ja-kinetic-source': [
    // a blog row's hover: 8% of the page text laid over whatever ground the row sits on
    ['mix:bg:fg:0.08', 'bg'],
    ['mix:surface:fg:0.08', 'surface'],
    ['mix:surface-warm:fg:0.08', 'surface-warm']
  ],
  'joomla-ja-symphony': [
    // the header's social buttons: the template's 10% white veil at rest, the accent fill on hover
    ['mix:band:#t4-header:ground:#ffffff:0.1', 'band:#t4-header:accentFill']
  ],
  'joomla-ja-space': [['accent-text', 'accent-on']],
  'joomla-ja-sensei': [['bg', 'info-bg']],
  'joomla-ja-impact': [
    ['surface', 'fg'],
    ['bg', 'fg']
  ]
}

for (const [name, pairs] of Object.entries(PAIRS))
  test(`${name}: each colour-only state differs from rest under every system`, () => {
    const c0 = loadContract(name)
    const base = contractBase(ROOT, c0)
    // one side per sheet, so the page's :root holds that side's roles
    const c = { ...c0, modes: false }
    let n = 0
    for (const [kind, dir] of [
      ['refero', 'vendor/tracy/refero/systems'],
      ['od', 'vendor/tracy/od-design-system/systems']
    ])
      for (const key of readdirSync(join(ROOT, dir)).sort()) {
        let p
        try {
          p = loadProfile(ROOT, `${kind}:${key}`)
          if (!gate(p).ok) continue
        } catch {
          continue
        }
        n++
        const sides =
          c0.modes === true ? [p, derive(p, modeOf(p) === 'dark' ? 'light' : 'dark').profile] : [p]
        for (const q of sides) {
          const css = joomlaSlot(q, base, c).css
          // every custom property the sheet sets, its first value that is not a reset (a kept band's `initial`),
          // a var() reference followed to its hex: a T4 sheet sets them on its token scope, not on :root
          /** @type {Record<string, string>} */
          const decls = {}
          for (const m of css.matchAll(/(--[\w-]+):([^;{}]+)/g))
            if (!(m[1] in decls) && m[2].trim() !== 'initial') decls[m[1]] = m[2].trim()
          const { tokens } = tokens56(q, base)
          /** @param {string} name @returns {string | undefined} */
          const hexOf = (name, depth = 0) => {
            const v = decls[name] ?? tokens[name]
            const ref = /^var\((--[\w-]+)(?:,.*)?\)$/.exec(String(v ?? ''))
            return ref && depth < 8 ? hexOf(ref[1], depth + 1) : v
          }
          /** @type {Record<string, string | undefined>} */
          const root = new Proxy({}, { get: (_, role) => hexOf(`--ds-c-${String(role)}`) })
          /** @param {string} x @returns {string | null | undefined} */
          const value = (x) => {
            if (x.startsWith('#')) return x
            if (x.startsWith('mix:')) {
              const [a, b, t] = x.slice(4).split(/:(?=[^:]*:[^:]*$)|:(?=[^:]*$)/)
              return mix(value(a) ?? '', value(b) ?? '', Number(t))
            }
            if (x.startsWith('band:')) {
              const [, band, role] = x.split(':')
              return bandColours(tokens, c0.bands[band], { page: base['--bg'] })?.[role]
            }
            return root[x]
          }
          for (const [a, b] of pairs) {
            const x = value(a)
            const y = value(b)
            assert.match(String(x), /^#([0-9a-f]{3}|[0-9a-f]{6})$/i, `${kind}:${key}: ${a} ${x}`)
            assert.match(String(y), /^#([0-9a-f]{3}|[0-9a-f]{6})$/i, `${kind}:${key}: ${b} ${y}`)
            assert.ok(distance(x, y) > HOVER_SAME, `${kind}:${key}: ${a} ${x} and ${b} ${y} look the same`)
          }
        }
      }
    assert.ok(n > 1000, `${n} systems`)
  })

test('joomla-ja-impact: the module still fits the 64000 bytes Joomla stores with the state rules', () => {
  for (const id of SYSTEMS) {
    const c = loadContract('joomla-ja-impact')
    const { html } = joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, c), c)
    assert.ok(new TextEncoder().encode(html).length <= 64000)
  }
})

// 1.0.5 re-points --ds-c-fg to --ds-c-bg inside a status fill (.bg-warning: the orange band of 'Donate today'),
// so a hover of fg under bg words read 1:1 there (HOVER-1, Moxie and refero 5fd3, 21/10/2026). The
// hover reads --color-dark, which :root sets to the system's text: a custom property is resolved where it is
// set, so the fill's re-pointed --ds-c-fg does not reach it.
test('joomla-ja-impact: the white-button hover reads the page text resolved at :root under every system', () => {
  const c0 = loadContract('joomla-ja-impact')
  const base = contractBase(ROOT, c0)
  const c = { ...c0, modes: false }
  let n = 0
  for (const [kind, dir] of [
    ['refero', 'vendor/tracy/refero/systems'],
    ['od', 'vendor/tracy/od-design-system/systems']
  ])
    for (const key of readdirSync(join(ROOT, dir)).sort()) {
      let p
      try {
        p = loadProfile(ROOT, `${kind}:${key}`)
        if (!gate(p).ok) continue
      } catch {
        continue
      }
      n++
      for (const q of [p, derive(p, modeOf(p) === 'dark' ? 'light' : 'dark').profile]) {
        const css = joomlaSlot(q, base, c).css
        const at = `${kind}:${key} ${modeOf(q)}`
        // the first --color-dark the sheet sets is the :root one (the kept scopes' reset comes after it)
        assert.equal(/--color-dark:([^;{}]+)/.exec(css)?.[1], 'var(--ds-c-fg)', `${at}: --color-dark`)
        assert.match(
          declsOf(css, '.btn:is(.btn-white, .btn-arrow-right):is(:hover, :focus)'),
          /^color:var\(--ds-c-bg\)!important;background-color:var\(--color-dark\)!important;border-color:var\(--color-dark\)!important$/,
          at
        )
      }
    }
  assert.ok(n > 1000, `${n} systems`)
})
