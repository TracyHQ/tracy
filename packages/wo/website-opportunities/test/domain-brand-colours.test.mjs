// Brand colours from the logo (spec TracyHQ/tracy#189, ADR 0023 amended 29/10/2026): a brief build whose brief holds the
// business's logo paints the template's brand colour roles with the logo's palette, each tone moved in lightness until it
// reads on the ground it sits on; the template's grounds, neutral text, greys and fonts stay. Every business below is
// made up: a florist with a purple and green logo, a law office with a navy logo, a bakery with no logo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  brandInkOf,
  brandPaletteOf,
  colourRoles,
  colourWords,
  planColours
} from '../domain/brand-colours.mjs'
import { contrastOf, hslOf, rgbOf } from '../domain/brand-colour-maths.mjs'
import { brandColourCss, cssRules, resolveVars, templateBrandColours } from '../domain/brand-colour-css.mjs'

const florist = {
  business: { name: 'Violet Lane Flowers' },
  brand: {
    origin: 'social',
    logo: 'asset-florist-logo',
    colorsFrom: 'logo',
    colors: [
      { hex: '#5b2a6e', role: 'primary' },
      { hex: '#4f8a3c', role: 'accent' },
      { hex: '#f7f5f2', role: 'neutral' }
    ],
    accent: { hex: '#4f8a3c', source: 'logo', share: 0.18 }
  }
}
const lawOffice = {
  business: { name: 'Harrow and Pike Legal' },
  brand: {
    origin: 'website',
    logo: 'asset-law-logo',
    colorsFrom: 'logo',
    colors: [
      { hex: '#1b2a4a', role: 'primary' },
      { hex: '#111111', role: 'neutral' }
    ]
  }
}
const bakeryNoLogo = {
  business: { name: 'Crumb and Co' },
  brand: { origin: 'social', colorsFrom: 'photos', colors: [{ hex: '#c27c3a', role: 'primary' }] }
}

const LIGHT = '#ffffff'
const DARK = '#121111'
const hueGap = (a, b) => {
  const d = Math.abs(hslOf(rgbOf(a)).h - hslOf(rgbOf(b)).h) % 360
  return Math.min(d, 360 - d)
}

test('the palette is the logo colours: primary, and the secondary when it is clearly another colour', () => {
  assert.deepEqual(brandPaletteOf(florist), { primary: '#5b2a6e', secondary: '#4f8a3c' })
  assert.deepEqual(brandPaletteOf(lawOffice), { primary: '#1b2a4a' })
})

test('no logo in the brief, colours from photos, or only greys: no palette, the template keeps its colours', () => {
  assert.equal(brandPaletteOf(bakeryNoLogo), null)
  assert.equal(brandPaletteOf({ ...lawOffice, brand: { ...lawOffice.brand, logo: null } }), null)
  assert.equal(
    brandPaletteOf({
      brand: {
        logo: 'a',
        colorsFrom: 'logo',
        colors: [
          { hex: '#f8f8f8', role: 'primary' },
          { hex: '#0a0a0a', role: 'accent' }
        ]
      }
    }),
    null
  )
  assert.equal(brandPaletteOf({}), null)
})

test('the site plan decision says which colours the site takes and why', () => {
  assert.deepEqual(planColours(florist), {
    decision: 'logo-colours',
    reason: 'logo-colours',
    palette: { primary: '#5b2a6e', secondary: '#4f8a3c' }
  })
  assert.deepEqual(planColours(bakeryNoLogo), { decision: 'template', reason: 'no-brief-logo' })
  assert.deepEqual(
    planColours({ brand: { logo: 'a', colorsFrom: 'logo', colors: [{ hex: '#777777', role: 'primary' }] } }),
    { decision: 'template', reason: 'no-logo-colours' }
  )
})

test('every role reads on light and dark grounds, in the same hue', () => {
  for (const hex of ['#5b2a6e', '#4f8a3c', '#1b2a4a', '#06301c', '#d8c25a'])
    for (const ground of [LIGHT, DARK]) {
      const r = colourRoles(hex, { grounds: [ground] })
      const at = `${hex} on ${ground}`
      assert.ok(contrastOf(r.fill, ground) >= 3, `fill vs ground ${at}`)
      assert.ok(contrastOf(r.on, r.fill) >= 4.5, `on-fill text ${at}`)
      assert.ok(contrastOf(r.on, r.hover) >= 4.5, `on-hover text ${at}`)
      assert.ok(contrastOf(r.on, r.active) >= 4.5, `on-active text ${at}`)
      assert.ok(contrastOf(r.text, ground) >= 4.5, `text ${at}`)
      assert.ok(contrastOf(r.textHover, ground) >= 4.5, `text hover ${at}`)
      assert.ok(contrastOf(r.line, ground) >= 3, `line ${at}`)
      assert.ok(contrastOf(r.soft, ground) < 1.6, `soft tint stays near the ground ${at}`)
      for (const role of ['fill', 'text', 'line']) assert.ok(hueGap(r[role], hex) <= 4, `${role} hue ${at}`)
    }
})

test('a colour that already reads keeps its own tone; a dark green link on a dark page gets a lighter green', () => {
  assert.equal(colourRoles('#1b2a4a', { grounds: [LIGHT] }).text, '#1b2a4a')
  const green = colourRoles('#06301c', { grounds: [DARK] })
  assert.ok(hslOf(rgbOf(green.text)).l > hslOf(rgbOf('#06301c')).l)
  assert.ok(contrastOf(green.text, DARK) >= 4.5)
})

test('the fill keeps the text colour the template puts on its brand colour when it can', () => {
  const r = colourRoles('#06301c', { grounds: [DARK], on: '#ffffff' })
  assert.equal(r.on, '#ffffff')
  assert.ok(contrastOf(r.fill, '#ffffff') >= 4.5)
  assert.ok(contrastOf(r.fill, DARK) >= 3)
})

// A T4-like stylesheet, made up: the framework's theme variables, a link and button rule reading them, a stock blue the
// framework ships but the template does not paint with, a status red, and a dark page.
const T4_CSS = `
:root{--t4-primary:var(--ds-c-accent,#0d6efd);--t4-link-color:var(--ds-c-accent,#0d6efd)}
.btn-primary{--t4-btn-bg:var(--ds-c-accent,#0d6efd);--t4-btn-color:#fff}
.text-danger{color:#dc3545!important}
.btn-danger{background-color:#dc3545}
:root{--color-primary:#e8402f;--color-secondary:#212529;--color-danger:#dc3545;--body-bg-color:#141313;--body-text-color:#8a8f94;--body-link-color:#e8402f;--body-link-hover-color:#e8402f;--mainnav-link-hover-color:#e8402f}
body{background-color:var(--body-bg-color);color:var(--body-text-color)}
a{color:var(--ds-c-accent-text,var(--body-link-color))}
a:hover{color:var(--ds-c-accent-text-hover,var(--body-link-hover-color))}
.btn.btn-primary{background-color:var(--color-primary);border-color:var(--color-primary)}
.pager li.active>a{background:var(--color-primary);color:var(--ds-c-fg-2,#fff)}
.shop .buy{background:var(--color-primary);color:#000}
.text-primary{color:var(--ds-c-accent-text,var(--color-primary))!important}
.ft-icon::after{background-color:var(--ds-c-accent,#E8402F)}
.hero .overlay{background:rgba(232,64,47,.65)}
.list li:before{border:1px solid var(--color-primary)}
.menu>li>a:hover{color:var(--mainnav-link-hover-color)}
.card{background:#1f1e1e;color:#fff;border-color:rgba(255,255,255,.1)}
@media (min-width:992px){.nav .active>a{color:var(--color-primary)}}
@font-face{font-family:x;src:url(data:font/woff2;base64,AAA;BBB)}
`

test('the template brand colour is measured from the framework role rules, not the stock or status colours', () => {
  const found = templateBrandColours([{ css: T4_CSS }])
  assert.equal(found.primary, '#e8402f')
  assert.equal(found.secondary, null)
  assert.deepEqual(found.grounds.base, ['#141313'])
})

/**
 * What a browser computes for `prop` of the rule with exactly `selector` in the generated CSS, on `side` (the page as it
 * opens, or a side block such as `.light-active`): the Tracy variables resolved from `:root` and that side's block.
 */
function computed(css, selector, prop, side = null) {
  const rules = cssRules(css)
  const vars = new Map()
  for (const r of rules)
    if (
      (r.selector === ':root' && !r.at.length) ||
      (side && r.selector === side && !r.at.length) ||
      (side && r.at.includes(side) && r.selector === ':root')
    )
      for (const d of r.decls) vars.set(d.prop, d.value)
  const rule = rules.filter((r) => r.selector === selector && r.decls.some((d) => d.prop === prop)).pop()
  if (!rule) return null
  const d = rule.decls.filter((x) => x.prop === prop).pop()
  return `${resolveVars(d.value, vars)}${d.important ? ' !important' : ''}`
}

test('the overrides repaint every brand colour role and nothing else (florist on a dark T4 page)', () => {
  const css = brandColourCss({ styles: [{ css: T4_CSS }], palette: brandPaletteOf(florist) })
  // The page ground and the template's dark card (`.card`): words in the brand colour read on both.
  // White words on the pager, black on the shop button: the fill reads both.
  const roles = colourRoles('#5b2a6e', {
    grounds: ['#141313', '#1f1e1e'],
    on: '#ffffff',
    alsoOn: ['#000000']
  })
  assert.doesNotMatch(css, /e8402f|232,\s*64,\s*47/i, 'no trace of the template red')
  assert.equal(computed(css, ':root', '--color-primary'), roles.fill)
  assert.equal(computed(css, ':root', '--body-link-color'), roles.text)
  assert.equal(computed(css, 'a', 'color'), roles.text)
  assert.equal(computed(css, '.btn.btn-primary', 'background-color'), roles.fill)
  assert.equal(computed(css, '.btn.btn-primary', 'border-color'), roles.fill)
  assert.equal(computed(css, '.text-primary', 'color'), `${roles.text} !important`)
  // The overlay keeps its own opacity.
  assert.equal(
    computed(css, '.hero .overlay', 'background'),
    `color-mix(in srgb,${roles.fill} 65%,transparent)`
  )
  // The template writes black words on one part and white on another: both read on the new fill, both left alone.
  assert.ok(contrastOf(roles.fill, '#000000') >= 4.5 && contrastOf(roles.fill, '#ffffff') >= 4.5, roles.fill)
  assert.equal(computed(css, '.shop .buy', 'color'), null, 'black words read: left alone')
  assert.equal(computed(css, '.pager li.active>a', 'color'), null, 'white words read: left alone')
  // Media queries are kept around their rules.
  assert.match(css, /@media \(min-width:992px\)\{\.nav \.active>a\{color:var\(--tracy-brand-0-text\)\}\}/)
  // The design-system accent roles the template reads take the palette too.
  assert.equal(computed(css, ':root', '--ds-c-accent'), roles.fill)
  assert.equal(computed(css, ':root', '--ds-c-accent-text'), roles.text)
  // Never: the status red, the page ground, the neutral text, the card greys, the stock blue.
  assert.doesNotMatch(css, /danger|dc3545|141313|8a8f94|1f1e1e|0d6efd|\.card/)
  assert.doesNotMatch(css, /<\/?style/i)
})
// A T3-like compiled stylesheet, made up: literal colours only, a light page, a darker hover shade of the brand colour.
const T3_CSS = `
body{background:#ffffff;color:#333333}
a{color:#2a9d8f}
a:hover,a:focus{color:#1f776c}
.btn-primary{background-color:#2a9d8f;border-color:#248a7d;color:#fff}
.btn-primary:hover{background-color:#1f776c}
.t3-megamenu .active>a{color:#2a9d8f}
.alert-error{color:#b94a48}
.section-dark{background:#222222;color:#eeeeee}
`

test('a compiled T3 stylesheet: the literal brand colour and its shades take the law office navy, on a light page', () => {
  const found = templateBrandColours([{ css: T3_CSS }])
  assert.equal(found.primary, '#2a9d8f')
  assert.deepEqual(found.grounds.base, ['#ffffff'])
  const css = brandColourCss({ styles: [{ css: T3_CSS }], palette: brandPaletteOf(lawOffice) })
  assert.doesNotMatch(css, /2a9d8f|1f776c|248a7d/)
  // The navy reads on white as it is, so it stays itself; the hover keeps its step from it.
  assert.equal(computed(css, 'a', 'color'), '#1b2a4a')
  const hover = computed(css, 'a:hover,a:focus', 'color')
  assert.ok(hover && hover !== '#1b2a4a' && contrastOf(hover, '#ffffff') >= 4.5, hover)
  assert.ok(computed(css, '.btn-primary:hover', 'background-color'))
  assert.doesNotMatch(css, /b94a48|222222|eeeeee|333333/)
  // No framework variable in a T3 stylesheet reads the design-system roles: none is set.
  assert.doesNotMatch(css, /--ds-c-/)
})

test('every side of the template takes tones that read on its own ground: a dark page that switches to light', () => {
  // Made up: a dark template whose light mode is a class on the body that redeclares the page ground variable.
  const css = `
:root{--color-primary:#e8402f;--page-bg:#121111;--link:#e8402f}
body{background-color:var(--page-bg)}
.light-active{--page-bg:#ffffff}
a{color:var(--link)}
.btn.btn-primary{background-color:var(--color-primary);color:#fff}
[data-bs-theme=dark] .lead{color:#e8402f}
@media (prefers-color-scheme:dark){.lead em{color:#e8402f}}`
  const found = templateBrandColours([{ css }])
  assert.deepEqual(found.grounds.base, ['#121111'])
  assert.deepEqual(found.grounds['.light-active'], ['#ffffff'])
  for (const brief of [lawOffice, florist]) {
    const out = brandColourCss({ styles: [{ css }], palette: brandPaletteOf(brief) })
    const dark = computed(out, 'a', 'color')
    const light = computed(out, 'a', 'color', '.light-active')
    assert.ok(contrastOf(dark, '#121111') >= 4.5, `dark side ${dark}`)
    assert.ok(contrastOf(light, '#ffffff') >= 4.5, `light side ${light}`)
    assert.notEqual(dark, light)
    const fill = computed(out, '.btn.btn-primary', 'background-color', '.light-active')
    assert.ok(contrastOf(fill, '#ffffff') >= 3 && contrastOf(fill, '#ffffff') >= 3)
    assert.match(out, /\.light-active\{[^}]*--color-primary:#/)
    assert.match(out, /@media \(prefers-color-scheme: dark\)\{:root\{/)
  }
})

test('no palette, or a stylesheet with no brand colour, writes nothing', () => {
  assert.equal(brandColourCss({ styles: [{ css: T4_CSS }], palette: null }), '')
  assert.equal(
    brandColourCss({
      styles: [{ css: 'body{background:#fff;color:#222}a{color:#222}' }],
      palette: brandPaletteOf(florist)
    }),
    ''
  )
})

test('a secondary brand colour of the template takes the logo secondary', () => {
  const css = `body{background:#fff}a{color:#c0392b}.btn-primary{background-color:#c0392b}.btn-secondary{background-color:#2e86c1}.text-secondary{color:#2e86c1}`
  const found = templateBrandColours([{ css }])
  assert.equal(found.primary, '#c0392b')
  assert.equal(found.secondary, '#2e86c1')
  const out = brandColourCss({ styles: [{ css }], palette: brandPaletteOf(florist) })
  const second = computed(out, '.btn-secondary', 'background-color')
  assert.ok(hueGap(second, '#4f8a3c') <= 4, `secondary ${second} is the logo green`)
})

test('the CSS reader keeps selectors, media and importance, and skips fonts and keyframes', () => {
  const rules = cssRules(
    '/* c{} */a{color:red!important}@media screen{b{x:url("a;b")}}@keyframes k{from{color:red}}@font-face{src:url(x)}'
  )
  assert.deepEqual(
    rules.map((r) => [r.at.join(' '), r.selector, r.decls.map((d) => [d.prop, d.value, d.important])]),
    [
      ['', 'a', [['color', 'red', true]]],
      ['@media screen', 'b', [['x', 'url("a;b")', false]]]
    ]
  )
})

test('an icon drawn in the template brand colour takes the palette at the same luminance; a grey icon stays', () => {
  const palette = brandPaletteOf(florist)
  const ink = brandInkOf('#e8402f', palette)
  assert.ok(hueGap(ink, '#5b2a6e') <= 4)
  // Same luminance, so the same contrast on whatever ground the demo icon was made for.
  for (const ground of [LIGHT, DARK, '#2a2a2a'])
    assert.ok(Math.abs(contrastOf(ink, ground) - contrastOf('#e8402f', ground)) < 0.25, ground)
  assert.equal(brandInkOf('#7a7a7a', palette), '#7a7a7a')
  assert.equal(brandInkOf('#e8402f', null), '#e8402f')
  assert.equal(brandInkOf(null, palette), null)
})

test('colour words for a drawing prompt name the colour plainly', () => {
  assert.equal(colourWords('#06301c'), 'dark green')
  assert.equal(colourWords('#5b2a6e'), 'dark purple')
  assert.equal(colourWords('#d8c25a'), 'yellow')
  assert.equal(colourWords('#1b2a4a'), 'dark blue')
})

// Any palette on any template (COO, 29/10/2026): one colour, two, very dark, very light, low saturation, many colours,
// on a dark T4 page, a light T3 page and a light T4 page whose brand colour is a blue.
const BLUE_T4_CSS = `
:root{--color-primary:#1e6fd9;--body-bg-color:#f6f7f9;--body-link-color:#1e6fd9;--mainnav-link-active-color:#1e6fd9}
body{background-color:var(--body-bg-color)}
a{color:var(--body-link-color)}
.btn.btn-primary{background-color:var(--color-primary);color:#fff}
.t4-megamenu .active>a{color:var(--mainnav-link-active-color)}
.feature .icon{color:var(--color-primary);border:2px solid var(--color-primary)}
`
const logoOf = (colors) => ({ brand: { logo: 'asset-logo', colorsFrom: 'logo', colors } })
const PALETTES = {
  'one colour': logoOf([{ hex: '#b5352a', role: 'primary' }]),
  'two colours': florist,
  'very dark': logoOf([{ hex: '#0b1a0f', role: 'primary' }]),
  'very light': logoOf([{ hex: '#f3e7a1', role: 'primary' }]),
  'low saturation': logoOf([{ hex: '#6d7b8a', role: 'primary' }]),
  'many colours': logoOf([
    { hex: '#e4572e', role: 'primary' },
    { hex: '#29335c', role: 'accent' },
    { hex: '#f3a712', role: 'accent' },
    { hex: '#669bbc', role: 'accent' }
  ])
}
const TEMPLATES = {
  'dark T4': { css: T4_CSS, brand: /e8402f/i, ground: '#141313' },
  'light T3': { css: T3_CSS, brand: /2a9d8f|1f776c|248a7d/i, ground: '#ffffff' },
  'light T4, blue brand': { css: BLUE_T4_CSS, brand: /1e6fd9/i, ground: '#f6f7f9' }
}

for (const [p, brief] of Object.entries(PALETTES))
  for (const [t, tpl] of Object.entries(TEMPLATES))
    test(`${p} on a ${t}: every brand role repainted, each tone reading on the page`, () => {
      const palette = brandPaletteOf(brief)
      assert.ok(palette, 'a palette')
      const out = brandColourCss({ styles: [{ css: tpl.css }], palette })
      assert.ok(out.length > 0)
      assert.doesNotMatch(out, tpl.brand)
      const roots = cssRules(out).filter((r) => r.selector === ':root')
      for (const d of roots.flatMap((r) => r.decls)) {
        const kind = /-(text|fill|line|on)(?:-shade-\d+)?$/.exec(d.prop)?.[1]
        if (!kind || kind === 'on') continue
        const bar = kind === 'text' ? 4.5 : 3
        assert.ok(contrastOf(d.value, tpl.ground) >= bar, `${d.prop} ${d.value} on ${tpl.ground}`)
        assert.ok(
          hueGap(d.value, palette.primary) <= 6 ||
            (palette.secondary && hueGap(d.value, palette.secondary) <= 6),
          `${d.prop} ${d.value} keeps the palette hue`
        )
      }
      for (const rule of cssRules(out))
        for (const d of rule.decls)
          if (!d.prop.startsWith('--'))
            assert.match(d.value, /var\(--tracy-brand-|^#|^\d/, `${rule.selector} ${d.prop}`)
    })

test('an inline SVG the template draws in its brand colour takes the line tone', () => {
  const pages = [
    { html: '<svg><path d="M0 0" fill="#E8402F"/><path stroke="#e8402f"/><path fill="#ffffff"/></svg>' }
  ]
  const css = brandColourCss({ styles: [{ css: T4_CSS }], palette: brandPaletteOf(lawOffice), pages })
  const line = colourRoles('#1b2a4a', {
    grounds: ['#141313', '#1f1e1e'],
    on: '#ffffff',
    alsoOn: ['#000000']
  }).line
  assert.equal(computed(css, '[fill="#E8402F" i]', 'fill'), line)
  assert.equal(computed(css, '[stroke="#e8402f" i]', 'stroke'), line)
  assert.doesNotMatch(css, /ffffff" i/)
})

test('words in the brand colour reach 4.5:1 on their side and 3:1 on the other sides, where one tone can', () => {
  const r = colourRoles('#06301c', { grounds: ['#ffffff'], others: ['#121111'] })
  assert.ok(contrastOf(r.text, '#ffffff') >= 4.5)
  assert.ok(contrastOf(r.text, '#121111') >= 3, `${r.text} still reads on a dark band in the light mode`)
  assert.ok(contrastOf(r.textHover, '#ffffff') >= 4.5)
  // With no other side, the owner's own colour stays wherever it reads.
  assert.equal(colourRoles('#1b2a4a', { grounds: ['#ffffff'] }).text, '#1b2a4a')
})

test('the brief tells the build and its checker exactly which colours may change, by workflow', async () => {
  const { briefForBuild } = await import('../domain/brief.mjs')
  const choice = {
    cms: 'joomla',
    cmsSource: 'account',
    resolvedAt: '2026-10-29T00:00:00.000Z',
    template: {
      platform: 'joomla',
      quickstart: 'made-up-template',
      design: 'default',
      version: '1.0.0',
      designSystem: { id: 'made-up', source: 'catalog', name: 'Made Up' }
    }
  }
  const line = (brief) => briefForBuild(brief, choice).acceptance.find((a) => /design system/.test(a))
  const brief = line({ ...florist, quickstartWorkflow: 'brief-build/1' })
  assert.match(
    brief,
    /brand colour roles, which take the colours of the business's logo \(#5b2a6e and #4f8a3c\)/
  )
  assert.match(brief, /page grounds, neutral text, greys and fonts stay the template's/)
  assert.doesNotMatch(brief, /[–—]/)
  // The agent demo keeps its one accent; a brief build with no logo keeps the plain rule.
  assert.match(
    line({ ...florist, brand: { ...florist.brand } }),
    /single exception is the logo accent #4f8a3c/
  )
  assert.doesNotMatch(line({ ...bakeryNoLogo, quickstartWorkflow: 'brief-build/1' }), /exception/)
})

test('the site plan carries the colour decision', async () => {
  const { planSite } = await import('../domain/site-plan.mjs')
  const served = { questions: [{ id: 'name', kind: 'text' }] }
  assert.equal(
    planSite(lawOffice, served, { now: '2026-10-29T00:00:00.000Z' }).colours.decision,
    'logo-colours'
  )
  assert.deepEqual(planSite(bakeryNoLogo, served, { now: '2026-10-29T00:00:00.000Z' }).colours, {
    decision: 'template',
    reason: 'no-brief-logo'
  })
})

// Made up: a dark template whose buttons draw an arrow in the brand colour three ways (an icon font glyph, a mask, a data
// URI picture), with a band painted by a picture and a hero photograph under a dark overlay that writes one word of its
// title in the brand colour. Its light mode is a class on the body.
const ICONS_CSS = `
:root{--color-primary:#e8402f;--page-bg:#121111}
body{background-color:var(--page-bg)}
.light-active{--page-bg:#ffffff}
a{color:var(--color-primary)}
.btn.btn-primary{background-color:var(--color-primary);color:#fff}
.btn.btn-secondary:after{content:"\\f061";font-family:'Icon Font';font-weight:900;color:var(--ds-c-accent-text,var(--color-primary))}
.arrow-mask{-webkit-mask:url(../images/arrow.svg) no-repeat center;mask-image:url(../images/arrow.svg);background-color:#e8402f}
.arrow-data{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='#e8402f'/%3E%3C/svg%3E")}
.band{background:#e8402f url(../images/band.jpg) no-repeat center}
.list li{list-style-image:url(../images/dot-e8402f.png);color:#e8402f}
.hero-wrap{background-size:cover;background-position:center;color:#fff;position:relative}
.hero-wrap:before{content:"";background:rgba(0,0,0,.8);position:absolute;top:0;left:0;height:100%;width:100%}
.hero-wrap .hero-title span{color:var(--color-primary)}
.promo-x h2 em{color:#e8402f}
`

test('an icon drawn by a glyph, a mask or a data URI keeps its drawing: only its colour is declared again', () => {
  const out = brandColourCss({ styles: [{ css: ICONS_CSS }], palette: brandPaletteOf(lawOffice) })
  // The icon font: colour only, never the glyph or its font.
  const glyph = cssRules(out).filter((r) => r.selector.startsWith('.btn.btn-secondary:after'))
  assert.equal(glyph.length, 1)
  assert.deepEqual(
    glyph[0].decls.map((d) => d.prop),
    ['color']
  )
  // The mask: its colour is the background, the mask itself is not re-declared.
  const mask = cssRules(out).find((r) => r.selector === '.arrow-mask')
  assert.deepEqual(
    mask?.decls.map((d) => `${d.prop}:${d.value}`),
    ['background-color:var(--tracy-brand-0-fill)']
  )
  // The data URI: the same picture again with its brand paint swapped for the line tone of each side.
  const line = (side) => /** @type {string} */ (computed(out, ':root', '--tracy-brand-0-line', side))
  const arrow = cssRules(out).filter((r) => r.selector.endsWith('.arrow-data'))
  assert.equal(arrow.length, 2, 'the page as it opens and its light side')
  assert.equal(arrow[0].selector, '.arrow-data')
  assert.equal(arrow[1].selector, '.light-active .arrow-data')
  const darkLine = colourRoles('#1b2a4a', { grounds: ['#121111'], on: '#ffffff' }).line
  const lightLine = colourRoles('#1b2a4a', { grounds: ['#ffffff'], on: '#ffffff', others: ['#121111'] }).line
  assert.match(arrow[0].decls[0].value, new RegExp(`fill='${darkLine}'`))
  assert.match(arrow[1].decls[0].value, new RegExp(`fill='${lightLine}'`))
  assert.ok(line(null) !== undefined)
  assert.doesNotMatch(out, /e8402f/i)
  // A value naming an external file is never declared again.
  assert.doesNotMatch(out, /images\//)
  // A shorthand with a picture gives up its colour alone; a list marker picture is never re-declared.
  const band = cssRules(out).find((r) => r.selector === '.band')
  assert.deepEqual(
    band?.decls.map((d) => `${d.prop}:${d.value}`),
    ['background-color:var(--tracy-brand-0-fill)']
  )
  const list = cssRules(out).find((r) => r.selector === '.list li')
  assert.deepEqual(
    list?.decls.map((d) => d.prop),
    ['color']
  )
  assert.doesNotMatch(
    out,
    /[{;](?:content|font-family|font-weight|-webkit-mask|mask(?:-image)?|list-style(?:-image)?):/
  )
})

test('words in the brand colour on a picture are judged against the picture, lighter than on the page, on every side', () => {
  const pages = [
    {
      html: '<section class="promo-x style-2" style="background-image: url(\'/images/p.jpg\')"><h2><em>Fresh</em></h2></section>'
    }
  ]
  for (const brief of [lawOffice, florist, logoOf([{ hex: '#06301c', role: 'primary' }])]) {
    const palette = /** @type {any} */ (brandPaletteOf(brief))
    const out = brandColourCss({ styles: [{ css: ICONS_CSS }], palette, pages })
    for (const side of [null, '.light-active']) {
      const hero = /** @type {string} */ (computed(out, '.hero-wrap .hero-title span', 'color', side))
      const promo = /** @type {string} */ (computed(out, '.promo-x h2 em', 'color', side))
      const link = /** @type {string} */ (computed(out, 'a', 'color', side))
      // The overlay is 80% black on a photograph: about #1a1a1a under the word.
      assert.ok(contrastOf(hero, '#1a1a1a') >= 7, `hero word ${hero} on the picture (${side ?? 'base'})`)
      assert.equal(promo, hero, 'a part painted by an inline picture counts too')
      assert.ok(hueGap(hero, palette.primary) <= 6, `${hero} keeps the hue`)
      if (side)
        assert.notEqual(hero, link, 'the light side link is darker, the word on the picture stays light')
    }
  }
})

test('a dark band without a picture is not a picture: its words keep the page tone', () => {
  const css = `${ICONS_CSS}\n.cta{background:#222;position:relative}\n.cta:after{content:"";border-bottom:1px solid #000}\n.cta p strong{color:#e8402f}`
  const out = brandColourCss({ styles: [{ css }], palette: brandPaletteOf(lawOffice) })
  assert.equal(computed(out, '.cta p strong', 'color'), computed(out, 'a', 'color'))
})

test('words another rule writes on a part now filled with the brand colour read on the new fill', () => {
  // Made up: the primary button's background and its black words come from two rules, as a compiled T4 sheet writes them.
  const css = `${ICONS_CSS}\n.pager .active>a{background:#e8402f;color:#fff}\n.btn.btn-primary,.read-more a{color:#000}`
  for (const brief of [
    lawOffice,
    logoOf([{ hex: '#06301c', role: 'primary' }]),
    logoOf([{ hex: '#f2d36b', role: 'primary' }])
  ]) {
    const out = brandColourCss({ styles: [{ css }], palette: brandPaletteOf(brief) })
    for (const side of [null, '.light-active']) {
      const fill = /** @type {string} */ (computed(out, '.btn.btn-primary', 'background-color', side))
      const words = computed(out, '.btn.btn-primary', 'color', side) ?? '#000000'
      assert.ok(contrastOf(words, fill) >= 4.5, `${words} on ${fill} (${side ?? 'base'})`)
    }
    assert.doesNotMatch(out, /\.read-more a\{color/, 'a part not filled keeps its words')
  }
})

test('words in the brand colour read on the template own surfaces of the page kind, not only on the page ground', () => {
  // Made up: a dark page with a slightly lighter tab bar, and a light mode with a pale band.
  const css = `${ICONS_CSS}\n.tabs .nav-link{background-color:#232222}\n.light-active .band-pale{background:#ececec}\n.tabs .nav-link.active{color:var(--color-primary)}`
  for (const brief of [
    lawOffice,
    florist,
    logoOf([{ hex: '#06301c', role: 'primary' }]),
    logoOf([{ hex: '#f2d36b', role: 'primary' }])
  ]) {
    const out = brandColourCss({ styles: [{ css }], palette: brandPaletteOf(brief) })
    const dark = /** @type {string} */ (computed(out, '.tabs .nav-link.active', 'color'))
    const light = /** @type {string} */ (computed(out, '.tabs .nav-link.active', 'color', '.light-active'))
    assert.ok(contrastOf(dark, '#232222') >= 4.5 && contrastOf(dark, '#121111') >= 4.5, `dark ${dark}`)
    assert.ok(contrastOf(light, '#ececec') >= 4.5 && contrastOf(light, '#ffffff') >= 4.5, `light ${light}`)
  }
})

test('an SVG data URI icon swaps only its brand paints, in every form a stylesheet writes them', async () => {
  const { recolourDataUris } = await import('../domain/brand-colour-data-uri.mjs')
  const toneOf = (hex) => (rgbOf(hex)?.r === 232 && rgbOf(hex)?.g === 64 ? '#123456' : null)
  // URL-encoded attribute, plain attribute, stroke and stop-color, upper case: each brand paint swapped, nothing else.
  assert.equal(
    recolourDataUris(
      `url("data:image/svg+xml,%3Cpath fill='%23E8402F' stroke='%23e8402f'/%3E%3Cstop stop-color='%23e8402f'/%3E%3Cpath fill='%23ffffff'/%3E")`,
      toneOf
    ),
    `url("data:image/svg+xml,%3Cpath fill='%23123456' stroke='%23123456'/%3E%3Cstop stop-color='%23123456'/%3E%3Cpath fill='%23ffffff'/%3E")`
  )
  assert.equal(
    recolourDataUris(`url('data:image/svg+xml;utf8,<svg><path fill="#e8402f"/></svg>')`, toneOf),
    `url('data:image/svg+xml;utf8,<svg><path fill="#123456"/></svg>')`
  )
  // A base64 payload is read, swapped and written back.
  const b64 = Buffer.from('<svg><path fill="#e8402f"/></svg>').toString('base64')
  const got = /** @type {string} */ (recolourDataUris(`url(data:image/svg+xml;base64,${b64})`, toneOf))
  assert.equal(
    Buffer.from(/** @type {string} */ (/base64,([^)]*)/.exec(got))[1], 'base64').toString(),
    '<svg><path fill="#123456"/></svg>'
  )
  // Nothing in the brand colour, an external file beside it, or a picture that is not SVG: no new value.
  assert.equal(recolourDataUris(`url("data:image/svg+xml,%3Cpath fill='%23000000'/%3E")`, toneOf), null)
  assert.equal(
    recolourDataUris(`url("data:image/svg+xml,%3Cpath fill='%23e8402f'/%3E"),url(../img/a.png)`, toneOf),
    null
  )
  assert.equal(recolourDataUris(`url(data:image/png;base64,iVBORw0KGgo=)`, toneOf), null)
  assert.equal(recolourDataUris(`url(../images/arrow.svg)`, toneOf), null)
})

test('a shorthand holding a data URI icon is declared again whole, its colour outside the picture as a variable', () => {
  const css = `${ICONS_CSS}\n.chip{background:#e8402f url("data:image/svg+xml,%3Cpath stroke='%23e8402f'/%3E") no-repeat}`
  const out = brandColourCss({ styles: [{ css }], palette: brandPaletteOf(florist) })
  const chip = cssRules(out).filter((r) => r.selector === '.chip' && r.decls[0].prop === 'background')
  assert.equal(chip.length, 1)
  assert.match(
    chip[0].decls[0].value,
    /^var\(--tracy-brand-0-fill\) url\("data:image\/svg\+xml,%3Cpath stroke='%23[0-9a-f]{6}'\/%3E"\) no-repeat$/
  )
  assert.doesNotMatch(out, /e8402f/i)
})
