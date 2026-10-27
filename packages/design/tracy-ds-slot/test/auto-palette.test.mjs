import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoPaletteCss, classifyPalette, groundRole, roleValues, textRole } from '../src/auto-palette.mjs'

/** A role's system value, escaped for a pattern. */
const re = (/** @type {string} */ role) => roleValues()[role].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const HI = ':root:root'

test('groundRole: the page, a card, a band on the other side, a brand fill', () => {
  assert.equal(groundRole('#ffffff', '#ffffff'), 'bg')
  assert.equal(groundRole('#fff9ef', '#ffffff'), 'surface')
  assert.equal(groundRole('#111111', '#ffffff'), 'band')
  assert.equal(groundRole('#f48a29', '#ffffff'), 'accent')
  assert.equal(groundRole('#1d3677', '#ffffff'), 'accent')
  // a brand colour that grounds a whole band is the band, not the accent buttons wear
  assert.equal(groundRole('#1d3677', '#ffffff', 0.08), 'band')
  assert.equal(groundRole('#ffe9a8', '#ffffff', 0.08), 'surface')
  // on a dark page a light block is the band
  assert.equal(groundRole('#f5f5f5', '#0b0b0b'), 'band')
})

test('textRole: by the ground it sits on, then by its look', () => {
  assert.equal(textRole('#ffffff', '#111111', '#ffffff'), 'on-band')
  assert.equal(textRole('#ffffff', '#f48a29', '#ffffff'), 'on-accent')
  assert.equal(textRole('#0cb76d', '#ffffff', '#ffffff'), 'accent-text')
  assert.equal(textRole('#212529', '#ffffff', '#ffffff'), 'fg')
  assert.equal(textRole('#8a8a8a', '#ffffff', '#ffffff'), 'muted')
})

const probe = {
  page: '#ffffff',
  rules: [
    ['.feature-date', 'background-color', '#f48a29', 0],
    ['.feature-date', 'color', '#ffffff', 0],
    ['.donate-band', 'background-color', '#1d3677', 1],
    ['.footer', 'background-color', '#111111', 0],
    ['.card', 'border-top-color', '#dddddd', 0],
    ['.lead', 'color', '#8a8a8a', 0]
  ],
  vars: { '--color-secondary': '#1d3677', '--body-text': '#212529' },
  inline: { '#f48a29|background-color': 2 },
  use: {
    '#ffffff': { area: 9e6, text: 12, grounds: { '#f48a29': 10, '#111111': 2 }, border: 0 },
    '#212529': { area: 0, text: 400, grounds: { '#ffffff': 400 }, border: 0 },
    '#1d3677': { area: 2e5, text: 0, grounds: {}, border: 0 }
  }
}

test('classifyPalette: every declaration gets a role; a hint wins', () => {
  const auto = classifyPalette(probe)
  const role = (s, p) => auto.rules.find((r) => r[0] === s && r[1] === p)?.[2]
  assert.equal(role('.feature-date', 'background-color'), 'accent')
  assert.equal(role('.feature-date', 'color'), 'on-accent')
  assert.equal(role('.footer', 'background-color'), 'band')
  assert.equal(role('.card', 'border-top-color'), 'border')
  assert.equal(role('.lead', 'color'), 'muted')
  // a neutral variable keeps the contract's meaning: only a brand colour is mapped by usage
  assert.deepEqual(Object.fromEntries(auto.vars), { '--color-secondary': 'accent' })
  const hinted = classifyPalette(probe, { roles: { '#111111': 'surface' } })
  assert.equal(hinted.rules.find((r) => r[0] === '.footer')[2], 'surface')
})

test('autoPaletteCss: system colours by role, a band with its text, !important kept, exceptions left', () => {
  const auto = classifyPalette(probe)
  const light = autoPaletteCss(auto, { dark: false, hi: HI, keep: ['.footer'] })
  assert.match(
    light,
    /:root \.feature-date\{background-color:var\(--ds-c-accent\);color:var\(--ds-c-accent-on\)\}/
  )
  assert.match(light, /:root \.donate-band\{background-color:var\(--ds-c-accent\)!important\}/)
  assert.ok(!light.includes('.footer'), 'a justified exception is never recoloured')
  assert.match(light, /:root:root\{--color-secondary:var\(--ds-c-accent\)\}/)
  assert.ok(
    !autoPaletteCss(auto, { dark: false, hi: HI, known: ['--color-secondary'] }).includes('--color-secondary')
  )
  assert.match(
    light,
    /\[style\*=";background-color:#f48a29" i\][^{]*\{background-color:var\(--ds-c-accent\)!important\}/
  )
  // a band: the system's ink on a light page, a raised surface on a dark one, as the page's side says
  // the same bytes whichever side the system is: the page decides
  assert.equal(autoPaletteCss(auto, { dark: true, hi: HI }), autoPaletteCss(auto, { dark: false, hi: HI }))
  const lightAll = autoPaletteCss(auto, { dark: false, hi: HI })
  assert.match(lightAll, new RegExp(`:root \\.footer\\{background-color:${re('band')}\\}`))
})

test('autoPaletteCss: a kept band stays outside, an unsafe selector never prints', () => {
  const auto = {
    page: '#fff',
    rules: [
      ['.a', 'color', 'fg', 0],
      ['.b}x{', 'color', 'fg', 0]
    ],
    vars: [],
    inline: []
  }
  const css = autoPaletteCss(auto, { dark: false, hi: HI, outside: (l) => l.map((s) => `${s}:not(.kept *)`) })
  assert.equal(css, ':root .a:not(.kept *){color:var(--ds-c-fg)}')
  assert.equal(autoPaletteCss(null, { dark: false, hi: HI }), '')
})

test('autoPaletteCss: a CMS preset or a slot variable is never repointed (it would make a cycle)', () => {
  const auto = {
    page: '#fff',
    rules: [],
    vars: [
      ['--wp--preset--color--accent', 'accent'],
      ['--brand', 'accent']
    ],
    inline: []
  }
  const css = autoPaletteCss(auto, { hi: HI })
  assert.ok(!css.includes('--wp--preset'), css)
  assert.ok(css.includes('--brand:var(--ds-c-accent)'), css)
})

test('autoPaletteCss: a rule read through a system variable stays, unless read in the other kind', () => {
  const auto = {
    page: '#fff',
    rules: [
      ['h1, h2', 'color', 'fg', 0, '--wp--preset--color--fg'],
      ['.rooms', 'background-color', 'band', 0, '--wp--preset--color--fg-2'],
      ['.chip', 'color', 'muted', 0, '--fg-2']
    ],
    vars: [],
    inline: []
  }
  const css = autoPaletteCss(auto, { hi: HI, known: ['--fg-2'] })
  assert.ok(!css.includes(':root:root h1,'), css)
  assert.ok(!css.includes('.chip'), css)
  assert.match(css, new RegExp(`\\.rooms\\{background-color:${re('band')}`))
})

test('autoPaletteCss: a contract band keeps its own ground and words; blocks inside it follow', () => {
  const auto = {
    page: '#fff',
    rules: [
      ['body .top-bar', 'background-color', 'band', 0],
      ['.top-bar a', 'color', 'on-band', 0],
      ['.top-bar .badge', 'background-color', 'accent', 0]
    ],
    vars: [],
    inline: []
  }
  const css = autoPaletteCss(auto, { hi: HI, bands: ['.top-bar'] })
  assert.ok(!css.includes('body .top-bar{'), css)
  assert.ok(!css.includes('.top-bar a'), css)
  assert.match(css, /\.top-bar \.badge\{background-color:var\(--ds-c-accent\)/)
})

test('every Joomla slot with a palette fits a Joomla module (its content column is a 64 KB TEXT)', async () => {
  const { readdirSync } = await import('node:fs')
  const { loadProfile, loadContract, contractBase } = await import('../src/library.mjs')
  const { joomlaSlot, MODULE_MAX_BYTES } = await import('../src/joomla.mjs')
  const ROOT = new URL('../../../../', import.meta.url).pathname
  const moxie = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  const names = readdirSync(new URL('../templates/palette/', import.meta.url))
    .filter((f) => f.startsWith('joomla-'))
    .map((f) => f.replace(/\.json$/, ''))
  assert.ok(names.length > 0)
  for (const n of names) {
    const c = loadContract(n)
    const bytes = Buffer.byteLength(joomlaSlot(moxie, contractBase(ROOT, c), c).html)
    assert.ok(bytes <= MODULE_MAX_BYTES, `${n}: ${bytes} bytes`)
  }
})

test('autoPaletteCss: words on a band follow it even through a preset; a button keeps its own words', () => {
  const auto = {
    page: '#fff',
    rules: [
      ['.footer .sub', 'color', 'on-band', 0, '--wp--preset--color--fg-2'],
      ['.cta .hx-btn-primary', 'color', 'on-band', 0],
      ['.cta a.wp-block-button__link:hover', 'color', 'on-band', 0]
    ],
    vars: [],
    inline: []
  }
  const css = autoPaletteCss(auto, { hi: HI })
  assert.match(css, new RegExp(`\\.footer \\.sub\\{color:${re('on-band')}`))
  assert.ok(!css.includes('hx-btn-primary') && !css.includes('button__link'), css)
})

test('autoPaletteCss: a selector list is split at its top-level commas only', () => {
  const auto = {
    page: '#fff',
    rules: [['.sec :where(h1, h2), .lead', 'color', 'fg', 0]],
    vars: [],
    inline: []
  }
  assert.equal(
    autoPaletteCss(auto, { hi: HI }),
    ':root .sec :where(h1, h2),:root .lead{color:var(--ds-c-fg)}'
  )
})

test('autoPaletteCss: a bare element selector never takes band colours', () => {
  const auto = {
    page: '#fff',
    rules: [
      ['a', 'color', 'on-band', 0],
      ['.band a', 'color', 'on-band', 0]
    ],
    vars: [],
    inline: []
  }
  const css = autoPaletteCss(auto, { hi: HI })
  assert.ok(!css.includes(':root:root a{'), css)
  assert.match(
    css,
    new RegExp(
      `\\.band a:not\\(\\[class\\*=btn\\]\\):not\\(\\[class\\*=button\\]\\)\\{color:${re('on-band')}`
    )
  )
})

test("autoPaletteCss: the heading classes are headings, never a band's words", () => {
  const auto = {
    page: '#fff',
    rules: [
      ['h1, .h1, h2, .h2', 'color', 'on-band', 0],
      ['.band .h2', 'color', 'on-band', 0]
    ],
    vars: [],
    inline: []
  }
  const css = autoPaletteCss(auto, { hi: HI })
  assert.ok(!css.includes(':root h1'), css)
  assert.match(css, new RegExp(`:root \\.band \\.h2\\{color:${re('on-band')}`))
})

test('autoPaletteCss: a bare element rule is written one :root above the template, below any class', () => {
  const auto = { page: '#fff', rules: [['p', 'color', 'fg', 0]], vars: [], inline: [] }
  assert.equal(autoPaletteCss(auto, { hi: HI }), ':root p{color:var(--ds-c-fg)}')
})

test("autoPaletteCss: the page's own ground is the system's page, whatever page it was read on", () => {
  // JA Kinetic Joomla: its body read as the page on the home, a surface on another demo home (classified
  // against the first page's colour) — the last role won and the page took the system's surface (15/10/2026)
  const auto = {
    page: '#0a0d0c',
    rules: [
      ['body', 'background-color', 'bg', 0],
      ['body', 'background-color', 'band', 0],
      ['body', 'background-color', 'surface', 0],
      ['html, body', 'background-color', 'surface', 0],
      ['body.item-2 .panel', 'background-color', 'surface', 0]
    ],
    vars: [],
    inline: []
  }
  const css = autoPaletteCss(auto, { hi: HI })
  assert.match(css, /^:root body\{background-color:var\(--ds-c-bg\)\}$/m)
  assert.match(css, /^:root,:root body\{background-color:var\(--ds-c-bg\)\}$/m)
  // a block inside the page keeps the role it was read in
  assert.match(css, /:root body\.item-2 \.panel\{background-color:var\(--ds-c-surface\)\}/)
})

test('classifyPalette: a selector hint names the role of one ground rule', () => {
  const probe = {
    page: '#ffffff',
    pageArea: 1e6,
    rules: [
      ['.evt--success', 'background-color', '#0cb76d', 0],
      ['.btn', 'background-color', '#0cb76d', 0]
    ],
    vars: {},
    inline: {},
    use: {}
  }
  const auto = classifyPalette(probe, { selectors: { '.evt--success': 'band' } })
  assert.deepEqual(
    auto.rules.map((r) => r[2]),
    ['band', 'accent']
  )
})

test('a palette rule read inside a @media block keeps its condition and is written back inside it', () => {
  // T4's phone menu panel (.nav-breakpoint-lg .t4-megamenu, white inside max-width: 991.98px) was read
  // flat and drew a box over JA Kinetic Joomla's desktop menu (14/10/2026)
  const probe = {
    page: '#0a0d0c',
    rules: [
      [
        '.nav-breakpoint-lg .t4-megamenu',
        'background-color',
        '#ffffff',
        0,
        null,
        null,
        '(max-width: 991.98px)'
      ],
      ['.kinetic-header', 'background-color', '#0a0d0c', 0]
    ],
    vars: {},
    inline: {},
    use: {}
  }
  const auto = classifyPalette(probe)
  assert.equal(auto.rules[0][5], '(max-width: 991.98px)', 'the condition rides on the row')
  assert.equal(auto.rules[1].length, 4, 'a row read outside any @media keeps its short form')
  const css = autoPaletteCss(auto, { hi: ':root' })
  assert.match(
    css,
    /@media \(max-width: 991\.98px\)\{:root \.nav-breakpoint-lg \.t4-megamenu\{background-color:/
  )
  assert.match(css, /(^|\})\s*:root \.kinetic-header\{background-color:/m, 'the other rule stays outside')
  // a condition that could close the sheet is never written
  const bad = { ...auto, rules: [['.x', 'background-color', 'band', 0, null, '(max-width:1px){}body{']] }
  assert.doesNotMatch(autoPaletteCss(bad, { hi: ':root' }), /\.x/)
})

test('a fill read through a line variable takes the line role, a fill through a ground variable keeps its own', () => {
  // JA Kinetic Joomla's incident timeline line (background: var(--border)) read as a surface and
  // vanished into its band (14/10/2026)
  const auto = classifyPalette({
    page: '#0a0d0c',
    rules: [
      ['.acm-incident-timeline .hx-inc-line', 'background-color', '#232a27', 0, null, '--border'],
      ['.hx-card', 'background-color', '#121614', 0, null, '--surface'],
      ['.rule', 'background-color', '#232a27', 0, null, '--chrome-border']
    ],
    vars: {},
    inline: {},
    use: {}
  })
  assert.deepEqual(
    auto.rules.map((r) => r[2]),
    ['border', 'surface', 'border']
  )
})

test("classifyPalette: words read through the template's heading variable take the heading role", () => {
  // JA Kinetic Joomla (14/10/2026): its timeline heading reads var(--heading), whose hex is the darkest
  // text; classified as text it went near-black under Toggl Track beside its plum sibling headings
  const auto = classifyPalette({
    page: '#fbfcfa',
    rules: [
      ['.acm-incident-timeline .hx-h2', 'color', '#10140f', 0, '#f2f5ee', '--heading'],
      ['.kinetic-logo .kinetic-logo-text', 'color', '#10140f', 0, '#fbfcfa', '--chrome-heading'],
      ['.acm-incident-timeline .hx-inc-text', 'color', '#10140f', 0, '#f2f5ee', '--text']
    ],
    vars: {},
    inline: {},
    use: { '#10140f': { area: 0, text: 300, grounds: { '#fbfcfa': 300 }, border: 0 } }
  })
  const role = (s) => auto.rules.find((r) => r[0] === s)?.[2]
  assert.equal(role('.acm-incident-timeline .hx-h2'), 'heading')
  assert.equal(role('.kinetic-logo .kinetic-logo-text'), 'heading')
  assert.equal(role('.acm-incident-timeline .hx-inc-text'), 'fg', 'body text stays text')
  const css = autoPaletteCss(auto, { dark: false, hi: HI })
  assert.match(css, /\.acm-incident-timeline \.hx-h2\{color:var\(--ds-c-fg-2, var\(--ds-c-fg\)\)\}/)
})
