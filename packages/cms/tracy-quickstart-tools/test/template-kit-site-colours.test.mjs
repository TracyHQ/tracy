// Template kit, site part: the brand colour measure on fabricated stylesheets (a theme variable, role rules, status
// colours, a light mode, a picture band with an overlay, an icon drawn as an SVG data URI) and the kit field built
// from it.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildBrandColours,
  dataUriIconsOf,
  paintsOfDataUri
} from '../template-kit/lib/site/brand-colours.mjs'
import { contrastOf, rgbOf, sideOfGround } from '../template-kit/lib/site/colour-maths.mjs'
import { measureBrandColours } from '../template-kit/lib/site/colour-measure.mjs'
import { onPicture, pictureGround, pictureScopesOf } from '../template-kit/lib/site/colour-pictures.mjs'
import { cssRules } from '../template-kit/lib/site/css-rules.mjs'
import { paletteHtml } from '../template-kit/lib/site/palette.mjs'
import { paletteVariableOf } from '../template-kit/lib/site/adapters/wordpress.mjs'

const THEME = `
:root{--color-primary:#2a7de1;--color-secondary:#f0a020;--color-danger:#d93030;--body-bg-color:#101418}
body{background-color:var(--body-bg-color);color:#c0c0c0}
body.light-active{--body-bg-color:#ffffff}
a{color:var(--color-primary)}
.btn-primary{background-color:var(--color-primary);color:#ffffff}
.btn-secondary{background-color:var(--color-secondary)}
.text-danger{color:var(--color-danger)!important}
.band-hero{background-image:url(../images/band.jpg);background-size:cover}
.band-hero::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.5)}
.arrow{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%232a7de1' d='M0 0'/%3E%3C/svg%3E")}
@media (max-width: 600px){a{color:#2a7de1}}
@font-face{font-family:x;src:url(a.woff)}
`
const styles = [{ from: '/css/theme.css', css: THEME }]

test('css rules keep at-rule groups, skip font faces, and never split inside url()', () => {
  const rules = cssRules(THEME)
  assert.ok(rules.some((r) => r.at[0] === '@media (max-width: 600px)' && r.selector === 'a'))
  assert.ok(!rules.some((r) => /font-face/.test(r.selector)))
  const arrow = rules.find((r) => r.selector === '.arrow')
  assert.match(arrow.decls[0].value, /^url\("data:image\/svg\+xml/)
})

test('the primary is voted from role rules and theme variables, status colours never win', () => {
  const m = measureBrandColours(styles)
  assert.equal(m.primary, '#2a7de1')
  assert.deepEqual(m.primaryRoles, ['button-fill', 'link', 'variable --color-primary'])
  assert.equal(m.secondary, '#f0a020')
  assert.ok(m.status.includes('#d93030'))
  assert.deepEqual(m.on, ['#ffffff'])
})

test('each side has its ground; a light mode is a side of its own', () => {
  const m = measureBrandColours(styles)
  assert.equal(m.sides.get('base').grounds[0], '#101418')
  assert.equal(m.sides.get('.light-active').grounds[0], '#ffffff')
  assert.equal(sideOfGround('#101418'), 'dark')
  assert.equal(sideOfGround('#ffffff'), 'light')
  assert.ok(contrastOf('#000000', '#ffffff') > 20)
  assert.deepEqual(rgbOf('rgba(10, 20, 30, 50%)'), { r: 10, g: 20, b: 30, a: 0.5 })
})

test('words on a picture are judged on the darkest overlay over a mid grey photograph', () => {
  const rules = cssRules(THEME)
  const { scopes, overlays } = pictureScopesOf(rules, [
    { html: '<div id="promo" style="background-image:url(/p.jpg)">' }
  ])
  assert.ok(onPicture('.band-hero h2', scopes))
  assert.ok(onPicture('#promo .title', scopes))
  assert.ok(!onPicture('.footer a', scopes))
  assert.equal(pictureGround(overlays), '#404040')
  assert.equal(pictureGround([]), '#1a1a1a')
})

test('an SVG data URI icon painted in the brand colour is found in every encoding', () => {
  assert.deepEqual(paintsOfDataUri("<svg><path fill='%232a7de1'/></svg>"), ['#2a7de1'])
  const b64 = `;base64,${Buffer.from('<svg><path stroke="#2a7de1"/></svg>').toString('base64')}`
  assert.deepEqual(paintsOfDataUri(b64), ['#2a7de1'])
  const icons = dataUriIconsOf(
    cssRules(THEME).map((r) => ({ ...r, from: '/css/theme.css' })),
    ['#2a7de1']
  )
  assert.equal(icons.length, 1)
  assert.equal(icons[0].selector, '.arrow')
})

test('the kit field: roles, sides, brand variables with where they are declared, and browser findings', () => {
  const { brandColours: bc, errors } = buildBrandColours({
    styles,
    seen: {
      opensOn: { markers: [], ground: '#101418' },
      inlineIcons: [
        { block: 'block-7', paints: ['#2a7de1'] },
        { block: 'block-8', paints: ['#999999'] }
      ],
      pictures: [{ file: 'images/demo/badge.png', colour: '#2a7de1', share: 0.3 }]
    }
  })
  assert.deepEqual(errors, [])
  assert.equal(bc.primary.value, '#2a7de1')
  assert.deepEqual(bc.statusColours, ['#d93030'])
  const light = bc.sides.find((s) => s.marker === '.light-active')
  assert.deepEqual([light.ground, light.groundSide, light.groundFrom], ['#ffffff', 'light', 'own'])
  assert.deepEqual(
    bc.tokens.find((t) => t.name === '--color-primary'),
    {
      name: '--color-primary',
      value: '#2a7de1',
      side: 'base',
      declaredIn: '/css/theme.css',
      brand: 'primary'
    }
  )
  assert.equal(bc.inlineIcons.length, 1)
  assert.equal(bc.pictures.length, 1)
  assert.match(paletteHtml(bc, 'Brand colours of a fabricated template'), /#2a7de1/)
})

test('no stylesheet and no browser read: every missing field is named, nothing is guessed', () => {
  const { brandColours: bc, errors } = buildBrandColours({ styles: [] })
  assert.equal(bc.primary, null)
  const fields = errors.map((e) => e.field)
  assert.ok(fields.includes('site.brandColours.primary'))
  assert.ok(fields.includes('site.brandColours.inlineIcons'))
  assert.ok(fields.includes('site.brandColours.pictures'))
})

test('a colour a variable names the primary stays brand when an alert or an error page class reuses it', () => {
  const css = `:root{--color-primary:#4d7c0f;--body-link-hover-color:#3f6a0a}
    a{color:var(--color-primary)} a:hover{color:var(--body-link-hover-color)}
    .btn-primary{background-color:var(--color-primary)} .bg-primary{background-color:var(--color-primary)}
    .alert-info{border-color:var(--color-primary)} .t4-error-page .cta a:hover{background-color:var(--color-primary)}`
  const m = measureBrandColours([{ css, from: 'template.css' }])
  assert.equal(m.primary, '#4d7c0f')
  assert.ok(m.primaryRoles.includes('button-fill'))
})

// A WordPress block theme names its accent in theme.json (`settings.color.palette`, slug `accent`), and a search badge
// may reuse it (`.badge-info`): the palette entry, read by the WordPress adapter, names the brand, so the reuse does
// not file the accent as a status colour. Fabricated stylesheet of a bakery theme.
const BAKERY = `a{color:#7a3b22} a:hover{color:#7a3b22}
  .btn-primary{background-color:var(--ds-c-accent, #b8552f)} .bg-primary{background-color:var(--ds-c-accent, #b8552f)}
  .search .badge-info{background:var(--ds-c-accent, #b8552f)}`

test('a theme.json palette accent stays the brand when a status rule reuses it', () => {
  const variables = paletteVariableOf({ slug: 'accent', color: 'var(--ds-c-accent, #b8552f)' }, 'theme.json')
  assert.deepEqual(variables, [
    { name: '--ds-c-accent', value: '#b8552f', declaredIn: 'theme.json', names: 'primary' }
  ])
  const m = measureBrandColours([{ css: BAKERY, from: 'template.css' }], { variables })
  assert.equal(m.primary, '#b8552f')
  assert.ok(m.primaryRoles.includes('button-fill'))
})

test('without a variable that names the brand, the reused colour is still a status colour (Joomla unchanged)', () => {
  const plain = [{ name: '--ds-c-accent', value: '#b8552f', declaredIn: 'theme.json' }]
  for (const variables of [[], plain]) {
    const m = measureBrandColours([{ css: BAKERY, from: 'template.css' }], { variables })
    assert.equal(m.primary, '#7a3b22')
    assert.ok(m.status.includes('#b8552f'))
  }
  // Only the palette slugs that name the brand do; the hover and status entries do not.
  for (const slug of ['accent-hover', 'accent-on', 'danger', 'bg'])
    assert.equal(
      paletteVariableOf({ slug, color: 'var(--ds-c-x, #b8552f)' }, 'theme.json')[0].names,
      undefined
    )
})
