// Spec TracyHQ/tracy#189 item 30 (COO decision 30/10/2026): a band that lost its working parts comes off whole. Measured
// on a local brief build: the footer's top band held a logo beside a newsletter box; the box came off (no destination in
// the brief), the band stayed, and the logo stood alone in an empty dark strip, although the header shows it already.
// Two invented trades on two invented template shapes: a bakery footer and a dental clinic intro strip. All names, places
// and files are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyFrameSelectors, emptyFramesOf } from '../src/sites/brief-engines/empty-frames.js'
import { checkEmptyFrames } from '../src/opportunities-build/empty-frame-check.js'

const header = `<div id="top" class="site-top"><header class="head"><a href="/"><img src="/images/brand/logo.png" alt="Crumb and Crust"></a>
<ul class="menu"><li><a href="/shop">Shop</a></li></ul></header></div>`

/** A bakery footer: the logo column kept, the newsletter column beside it emptied, the menus below. */
const bakeryFooter = (newsletter = '') => `<html><body>${header}<main><p>Sourdough baked at dawn.</p></main>
<div id="foot" class="site-foot"><div class="foot-inner"><div class="foot-item">
<div class="container"><div class="foot-info"><div class="row">
<div class="col-12 col-md-4"><div class="module" id="Mod21"><a href="/index.php"><img src="/images/brand/logo-dark.png" width="175"></a></div></div>
<div class="col-12 col-md-8 foot-signup">${newsletter}</div>
</div></div></div>
<div class="foot-nav"><div class="container"><ul><li><a href="/shop">Shop</a></li><li><a href="/visit">Visit us</a></li></ul></div></div>
</div></div></div></body></html>`

/** A dental clinic intro strip: a drawn tooth icon kept, the heading column beside it emptied. */
const dentalIntro = `<html><body>${header}<section id="intro" class="strip">
<div class="wrap"><div class="cols"><div class="icon-col"><svg viewBox="0 0 10 10"><path d="M1 1h8v8H1z"/></svg></div>
<div class="text-col"><h2> </h2><p></p></div></div></div>
<div class="next"><p>Check-ups and cleaning at Brightside Dental.</p></div></section></body></html>`

const BAKERY_BAND =
  '#foot > div.foot-inner:nth-child(1) > div.foot-item:nth-child(1) > div.container:nth-child(1)'

test('bakery: the footer band left with only its logo comes off whole, padding and all', () => {
  const { bands } = emptyFramesOf(bakeryFooter())
  assert.deepEqual(bands, [BAKERY_BAND])
  assert.ok(emptyFrameSelectors(bakeryFooter()).includes(BAKERY_BAND), 'the head block hides it')
})

test('dental clinic: an intro strip left with only its icon comes off whole', () => {
  assert.deepEqual(emptyFramesOf(dentalIntro).bands, ['#intro > div.wrap:nth-child(1)'])
})

test('a band that keeps its working part, the header logo and a photo beside an emptied column all stay', () => {
  const kept = bakeryFooter('<h4>Fresh loaves weekly</h4><form><input type="email"></form>')
  assert.deepEqual(emptyFramesOf(kept).bands, [])
  const photo = bakeryFooter()
    .replace('/images/brand/logo-dark.png', '/images/content/oven.jpg')
    .replace('/index.php', '/shop')
  assert.deepEqual(emptyFramesOf(photo).bands, [], 'a photo is content, not decoration')
  const spacer = bakeryFooter().replace('col-12 col-md-8 foot-signup', 'clearfix')
  assert.deepEqual(emptyFramesOf(spacer).bands, [], 'a clearfix is meant to be empty')
})

test('the final check reports a lone decoration band the head block does not hide', () => {
  const net = '<style data-tracy-leftovers>.x{display:none}</style>'
  const page = { path: '/', status: 200, html: bakeryFooter().replace('<body>', `<body>${net}`) }
  const found = checkEmptyFrames({ pages: [page] }).filter((f) => f.kind === 'lone-decoration-band')
  assert.deepEqual(
    found.map((f) => [f.page, f.found, f.severity]),
    [['/', BAKERY_BAND, 'major']]
  )
  const hidden = page.html.replace('.x{display:none}', `${BAKERY_BAND}{display:none!important}`)
  assert.deepEqual(
    checkEmptyFrames({ pages: [{ ...page, html: hidden }] }).filter((f) => f.kind === 'lone-decoration-band'),
    []
  )
})
