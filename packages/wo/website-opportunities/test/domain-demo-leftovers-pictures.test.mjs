// The picture kinds of the demo-leftover check, sharpened (spec TracyHQ/tracy#189, tickets #194 and #195): C01 a demo
// picture in a general slot, C04 a demo icon, C05 a demo cut-out figure, C06 a demo picture several cards share. Each is
// found wherever a page carries it (a background, a lazy-load attribute, a copy the CMS made), on a racket club map and
// on a bakery map. Fixtures are fictional.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'

const img = (key, role, file, extra = {}) => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  role,
  sample: `images/demo/${file}#joomlaImage://local-images/demo/${file}?width=800&height=600`,
  ...extra
})
const card = (n) => ({ group: { id: `module-5.item.${n}`, item: n, kind: 'service' } })
const CLUB = {
  slots: [
    img('module-1.0', 'business.hero_image', 'hero/band.jpg'),
    img('module-1.1', 'business.hero_image', 'hero/figure.png', { fit: { kind: 'cutout' } }),
    img('module-2.0', 'editorial.item_icon', 'icons/mark-1.png', { fit: { kind: 'icon' } }),
    img('module-2.1', 'editorial.design_element', 'shapes/line.png', {
      fit: { kind: 'decoration' },
      decor: 'design'
    }),
    img('module-5.0', 'offering.image', 'classes/shared.jpg', card(0)),
    img('module-5.1', 'offering.image', 'classes/shared.jpg', card(1)),
    img('module-6.0', 'business.gallery_image', 'gallery/tile.jpg')
  ]
}
const BAKERY = {
  slots: [
    img('module-1.0', 'editorial.illustration', 'about/oven.jpg'),
    img('module-3.0', 'business.hero_image', 'hero/cutout-loaf.png', { fit: { kind: 'cutout' } }),
    img('module-3.1', 'editorial.item_icon', 'icons/whisk.svg')
  ]
}
const brief = { business: { name: 'Juniper Racket Club' } }
const run = (contentMap, html) =>
  checkDemoLeftovers({
    pages: [{ path: '/', status: 200, html: `<html><body>${html}</body></html>` }],
    contentMap,
    brief
  })
const kinds = (report, kind) => report.findings.filter((f) => f.kind === kind).map((f) => f.place)

test('C01 a demo hero set as an inline background, or as a lazy-load attribute, is reported', () => {
  assert.deepEqual(
    kinds(
      run(CLUB, '<section style="background-image:url(\'/images/demo/hero/band.jpg\')"></section>'),
      'C01'
    ),
    ['module-1.0']
  )
  assert.deepEqual(kinds(run(CLUB, '<img data-src="/images/demo/gallery/tile.jpg" src="data:,">'), 'C01'), [
    'module-6.0'
  ])
  assert.deepEqual(kinds(run(BAKERY, '<img src="/images/demo/about/oven.webp">'), 'C01'), ['module-1.0'])
})

test('C01 an owner picture in the slot is no leftover', () => {
  const report = run(
    CLUB,
    '<section style="background-image:url(/images/tracy-quickstart/ab12.jpg)"></section>'
  )
  assert.deepEqual(kinds(report, 'C01'), [])
})

test('C04 a demo icon is reported, also as a resized copy; a design piece never is', () => {
  assert.deepEqual(kinds(run(CLUB, '<img src="/images/demo/icons/mark-1_100x100.png">'), 'C04'), [
    'module-2.0'
  ])
  assert.deepEqual(kinds(run(BAKERY, '<img src="/images/demo/icons/whisk.svg">'), 'C04'), ['module-3.1'])
  const design = run(CLUB, '<img src="/images/demo/shapes/line.png">')
  assert.equal(design.findings.length, 0, JSON.stringify(design.findings))
})

test('C05 a cut-out is read from its Slot fit, not from its file name or its role', () => {
  assert.deepEqual(kinds(run(BAKERY, '<img src="/images/demo/hero/cutout-loaf.png">'), 'C05'), ['module-3.0'])
  const club = run(CLUB, '<img src="/images/demo/hero/figure.png">')
  assert.deepEqual(kinds(club, 'C05'), ['module-1.1'])
  assert.deepEqual(kinds(club, 'C01'), [], 'a cut-out is not counted again as a general picture')
})

test('C06 a demo picture two cards of one module share is reported, once per page', () => {
  const report = run(
    CLUB,
    '<img src="/images/demo/classes/shared.jpg"><img src="/images/demo/classes/shared.jpg">'
  )
  assert.deepEqual(kinds(report, 'C06'), ['images/demo/classes/shared.jpg'])
  // Once each card shows its own picture, nothing is left.
  assert.deepEqual(
    kinds(
      run(CLUB, '<img src="/images/tracy-quickstart/1.jpg"><img src="/images/tracy-quickstart/2.jpg">'),
      'C06'
    ),
    []
  )
})

test('C04 and C13 count a demo file once per page, however many slots of the map hold it', () => {
  // One icon set reused by a module, its twin and each offering's page; one logo printed light, dark and in the footer.
  for (const [trade, icon] of [
    ['Juniper Racket Club', 'icons/mark-1.png'],
    ['Crumb Street Bakery', 'icons/whisk.png']
  ]) {
    const contentMap = {
      slots: [
        img('module-2.0', 'editorial.item_icon', icon, { fit: { kind: 'icon' } }),
        img('module-9.0', 'editorial.item_icon', icon, { fit: { kind: 'icon' } }),
        img('article-4.7', 'editorial.item_icon', icon, { fit: { kind: 'icon' } }),
        img('module-7.1', 'business.logo', 'logo/mark.png', { fit: { kind: 'logo' } }),
        img('siteSetting-1.0', 'business.logo', 'logo/mark.png', { fit: { kind: 'logo' } })
      ]
    }
    const report = checkDemoLeftovers({
      pages: [
        {
          path: '/',
          status: 200,
          html: `<img src="/images/demo/${icon}"><img class="logo-img" src="/images/demo/logo/mark.png">`
        }
      ],
      contentMap,
      brief: { business: { name: trade } }
    })
    const icons = report.findings.filter((f) => f.kind === 'C04')
    assert.equal(icons.length, 1, trade)
    assert.deepEqual(icons[0].slots, ['module-2.0', 'module-9.0', 'article-4.7'])
    const logos = report.findings.filter((f) => f.kind === 'C13')
    assert.equal(
      logos.length,
      1,
      `${trade}: the map's two logo slots and the logo img are one file on one page`
    )
    assert.deepEqual(logos[0].slots, ['module-7.1', 'siteSetting-1.0', 'img /images/demo/logo/mark.png'])
  }
})
