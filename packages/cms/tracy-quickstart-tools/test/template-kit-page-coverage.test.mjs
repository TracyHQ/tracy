// A slot is one element on the page, never one text: three elements printing "Rest a minute" are three slots. A
// clickable element without an address (a button opening a map) whose label is a slot says what it opens. Both are
// checked against the page's own reading, so a kit that merged them is caught. Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { buildBlock } from '../template-kit/lib/kit-blocks.mjs'
import { indexMap } from '../template-kit/lib/map-index.mjs'
import { linkLabelSlots, linksWithoutLabelSlot } from '../template-kit/lib/link-label-slots.mjs'
import { linksWithoutTarget, textsWithoutSlot } from '../template-kit/lib/page-coverage.mjs'
import { imagesWithoutFrame, pictureFrames } from '../template-kit/lib/picture-frames.mjs'
import { readDetails } from '../template-kit/lib/read-details.js'
import { sampleIndex } from '../template-kit/lib/sample-index.mjs'
import { templateGaps } from '../template-kit/lib/template-gaps.mjs'

const text = (n, sample, role = 'editorial.paragraph') => ({
  key: `article-5.${n}`,
  entity: 'article-5',
  type: 'text',
  role,
  sample
})
const MAP = {
  entities: [{ key: 'article-5', kind: 'article', identity: {} }],
  slots: [
    text(1, 'Lane drills'),
    text(2, 'Rest a minute'),
    text(3, 'Kick sets'),
    text(4, 'Rest a minute'),
    text(5, 'Pull sets'),
    text(6, 'Rest a minute'),
    text(7, 'see the pool on a map', 'editorial.button_label')
  ],
  pages: []
}
const READING = {
  texts: ['Lane drills', 'Rest a minute', 'Kick sets', 'Pull sets', 'see the pool on a map'],
  textCounts: {
    'Lane drills': 1,
    'Rest a minute': 3,
    'Kick sets': 1,
    'Pull sets': 1,
    'see the pool on a map': 1
  },
  clickables: [
    {
      position: 0,
      label: 'see the pool on a map',
      tag: 'button',
      target: { kind: 'modal', element: '#poolMap', shows: 'map' }
    }
  ],
  links: [],
  repeats: []
}
const build = () =>
  buildBlock({
    rec: { id: 'body-pool', source: 'main-body', widths: { 1440: { pages: ['pool'], details: READING } } },
    entity: 'article-5',
    idx: indexMap(MAP),
    samples: sampleIndex(MAP),
    errors: [],
    minEvidence: {},
    siteUrl: 'http://site.example',
    aliasHosts: [],
    widths: ['1440']
  })
const readings = new Map([['body-pool', READING]])

test('three elements printing the same words are three slots of the block, in content map order', () => {
  const b = build()
  const rests = b.slots.filter((s) => s.sample === 'Rest a minute').map((s) => s.id)
  assert.deepEqual(rests, ['article-5.2', 'article-5.4', 'article-5.6'])
})

test('a button opening a map is a link of the block: its label slot and what it opens', () => {
  const b = build()
  const button = b.links.find((l) => l.element === 'button')
  assert.ok(button, JSON.stringify(b.links))
  assert.equal(button.labelId, 'article-5.7')
  assert.deepEqual(
    [button.opens.kind, button.opens.element, button.opens.shows, button.opens.writable],
    ['modal', '#poolMap', 'map', false]
  )
  assert.match(button.opens.writableReason, /no content map slot/)
})

test('a link to an address of the site that only runs a task opens that action: no dead link, a missing page still is', () => {
  const b = buildBlock({
    rec: {
      id: 'body-lane',
      source: 'main-body',
      widths: {
        1440: {
          pages: ['lane'],
          details: {
            ...READING,
            clickables: [],
            links: [
              { label: 'Ask the coach', href: '/index.php/pool/lane-3?task=askquestion&tmpl=component' },
              { label: 'Old lane', href: '' }
            ]
          }
        }
      }
    },
    entity: 'article-5',
    idx: indexMap(MAP),
    samples: sampleIndex(MAP),
    errors: [],
    minEvidence: {},
    siteUrl: 'http://site.example',
    aliasHosts: [],
    widths: ['1440']
  })
  const ask = b.links.find((l) => l.label === 'Ask the coach')
  assert.equal(ask.target, null)
  assert.deepEqual(ask.opens, { kind: 'action', action: '/pool/lane-3?task=askquestion&tmpl=component' })
  const gaps = templateGaps({ kit: { pages: [], blocks: [b] } })
  assert.deepEqual(
    gaps.map((g) => g.detail),
    ['link "Old lane" has no target']
  )
})

test('gate: elements printing content with no slot of their own, and clickables without a target, are named', () => {
  const b = build()
  b.source = { entity: 'article-5', contains: [] }
  const kit = { blocks: [b] }
  const none = []
  const fail = (...f) => none.push(f)
  assert.equal(textsWithoutSlot({ kit, map: MAP, readings, fail }), 0)
  assert.equal(linksWithoutTarget({ kit, map: MAP, readings, fail }), 0)
  assert.deepEqual(none, [])
  // A kit that merged the three into one slot and listed no button.
  const merged = {
    ...b,
    slots: b.slots.filter((s) => !['article-5.4', 'article-5.6'].includes(s.id)),
    links: b.links.filter((l) => l.element !== 'button')
  }
  const failed = []
  const add = (part, where, reason) => failed.push([part, where, reason])
  assert.equal(textsWithoutSlot({ kit: { blocks: [merged] }, map: MAP, readings, fail: add }), 2)
  assert.equal(linksWithoutTarget({ kit: { blocks: [merged] }, map: MAP, readings, fail: add }), 1)
  assert.deepEqual(
    failed.map(([part, where]) => `${part} ${where}`),
    [
      'textsWithoutSlot blocks[body-pool] article-5.4 article-5.6',
      'linksWithoutTarget blocks[body-pool] article-5.7'
    ]
  )
  assert.match(failed[0][2], /Rest a minute.*3 elements but 1 slot/)
})

test('the read pass names what each clickable opens: a tab by its #fragment, a menu heading its submenu', async (t) => {
  // A fabricated price table with two tabs, a menu heading over a submenu, and a menu link with a real address.
  const html = `<div data-kit-block="prices">
    <ul class="nav nav-tabs"><li><a href="#tab-a" role="tab" data-bs-toggle="tab">Day passes</a></li>
    <li><a href="#tab-b" role="tab" data-bs-toggle="tab">Season passes</a></li></ul>
    <div id="tab-a">Ten swims</div><div id="tab-b" style="display:none">All season</div>
    <ul><li><a href="javascript:;" role="button" aria-haspopup="true">Visit</a><ul><li><a href="/hours">Hours</a></li></ul></li>
    <li><a href="/about" role="button" aria-haspopup="true">About</a><ul><li><a href="/team">Team</a></li></ul></li></ul></div>`
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage()
    await page.setContent(html)
    const details = await page.evaluate(readDetails)
    assert.deepEqual(
      details.prices.clickables.map((c) => [c.label, c.target?.kind, c.target?.element ?? null]),
      [
        ['Day passes', 'tab', '#tab-a'],
        ['Season passes', 'tab', '#tab-b'],
        ['Visit', 'submenu', null]
      ]
    )
    // Bootstrap 3 markup (a T3 template): `data-toggle` tabs whose #fragment is a selector, and a play button whose
    // address is a script.
    await page.setContent(`<div data-kit-block="film">
      <ul class="nav nav-tabs"><li><a href="#mod-7 .mod-8" role="tab" data-toggle="tab">Lanes</a></li></ul>
      <div id="mod-7"><div class="mod-8">Lane times</div></div>
      <a class="play-video" href="javascript:void(0);" role="button" aria-label="Play film"><i style="display:inline-block;width:20px;height:20px"></i></a></div>`)
    const bs3 = await page.evaluate(readDetails)
    assert.deepEqual(
      bs3.film.clickables.map((c) => [c.label, c.target?.kind, c.target?.element ?? null]),
      [
        ['Lanes', 'tab', '#mod-7 .mod-8'],
        ['Play film', 'script', null]
      ]
    )
    // A carousel control (`data-slide`, Bootstrap 3) moves the carousel its #fragment names; a `#` link held by a
    // form (the stars of a rating form) is a control of that form.
    await page.setContent(`<div data-kit-block="reel">
      <div id="reel-9" class="carousel"><div class="item">Slide</div></div>
      <a data-slide="prev" role="button" aria-label="Back" href="#reel-9" class="left carousel-control" style="display:inline-block;width:20px;height:20px"></a>
      <form class="rate" method="POST" action="/notes/12-a-quiet-week"><ul><li><a href="#" title="2 of 5">2</a></li></ul></form></div>`)
    const more = await page.evaluate(readDetails)
    assert.deepEqual(
      more.reel.clickables.map((c) => [
        c.label,
        c.target?.kind,
        c.target?.element ?? c.target?.action ?? null
      ]),
      [
        ['Back', 'slide', '#reel-9'],
        ['2', 'form', '/notes/12-a-quiet-week']
      ]
    )
  } finally {
    await browser.close()
  }
})

test("every link showing a slot's words names it: its address group first, twins each their own, coincidences none", () => {
  // A fabricated pool block: a button whose label and address are one content map row, two "Book a lane" buttons
  // over two twin slots, an item title linking to the item, and an icon whose words two unrelated slots share.
  const map = {
    slots: [
      {
        key: 'module-9.1',
        entity: 'module-9',
        type: 'text',
        role: 'editorial.heading',
        sample: 'Swim with us'
      },
      {
        key: 'module-9.2',
        entity: 'module-9',
        type: 'text',
        role: 'contact.cta_label',
        sample: 'Swim with us',
        group: { id: 'g1' }
      },
      {
        key: 'module-9.3',
        entity: 'module-9',
        type: 'url',
        role: 'contact.cta_url',
        sample: '#',
        group: { id: 'g1' }
      },
      {
        key: 'module-9.4',
        entity: 'module-9',
        type: 'text',
        role: 'editorial.button_label',
        sample: 'Book a lane'
      },
      {
        key: 'module-9.5',
        entity: 'module-9',
        type: 'text',
        role: 'editorial.button_label',
        sample: 'Book a lane'
      },
      {
        key: 'article-3.1',
        entity: 'article-3',
        type: 'text',
        role: 'article.title',
        sample: 'Open water tips'
      },
      {
        key: 'module-2.1',
        entity: 'module-2',
        type: 'text',
        role: 'contact.social_label',
        sample: 'Facebook'
      },
      {
        key: 'module-4.1',
        entity: 'module-4',
        type: 'text',
        role: 'contact.social_label',
        sample: 'Facebook'
      }
    ]
  }
  const kit = {
    blocks: [
      {
        id: 'pool',
        source: { entity: 'module-9', contains: [] },
        slots: [{ id: 'block-9.1' }, { id: 'block-9.2' }, { id: 'block-9.4' }],
        links: [
          { id: 'block-9.3', label: 'SWIM WITH US', target: '/join' },
          { id: 'pool.link-2', label: 'Book a lane', target: '/book' },
          { id: 'pool.link-3', label: 'Book a lane', target: '/book' },
          { id: 'pool.link-4', label: 'Open water tips', target: '/tips' },
          { id: 'pool.link-5', label: 'Facebook', target: null },
          { id: 'pool.link-6', label: 'Read more', target: '/tips' }
        ]
      }
    ]
  }
  const failed = []
  assert.equal(linksWithoutLabelSlot({ kit, map, fail: (...f) => failed.push(f) }), 4)
  assert.deepEqual(
    failed.map((f) => f[1]),
    [
      'blocks[pool].links[block-9.3] block-9.2',
      'blocks[pool].links[pool.link-2] block-9.4',
      'blocks[pool].links[pool.link-3] block-9.4',
      'blocks[pool].links[pool.link-4] article-3.1'
    ]
  )
  assert.equal(linkLabelSlots(kit, map), 4)
  assert.deepEqual(
    kit.blocks[0].links.map((l) => l.labelId ?? null),
    ['block-9.2', 'block-9.4', 'block-9.5', 'article-3.1', null, null]
  )
  assert.equal(linksWithoutLabelSlot({ kit, map, fail: () => assert.fail('no link is left') }), 0)
})

test('the read pass lists every picture a block shows: an <img>, its own CSS background, and one painted behind it', async (t) => {
  // A fabricated pool site: a page layer outside every block painting a photo behind a transparent title band, a
  // band with a solid colour that hides it, and a card with an <img> and a CSS background of its own.
  const html = `<style>body{margin:0}.layer{position:absolute;top:0;left:0;width:800px;height:300px;
    background:url(/media/pool-water.jpg) center/cover}.band{position:relative;height:200px}
    .solid{position:relative;height:200px;background:#111}.card{position:relative;height:200px}
    .card .bg{width:300px;height:150px;background-image:url('/media/lane.jpg')}</style>
    <div class="layer"></div><div class="band" data-kit-block="band"><h1>Swim</h1></div>
    <div class="solid" data-kit-block="solid"><h2>Hours</h2></div>
    <div class="card" data-kit-block="card"><img src="/media/coach.jpg" width="120" height="120"><div class="bg"></div>
    <i style="display:inline-block;width:60px;height:60px;background:url('data:image/svg+xml;base64,PHN2Zy8+')"></i></div>`
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    // The page is served from a fabricated address so its picture paths read as files of the site.
    await page.route('**/*', (r) =>
      new URL(r.request().url()).pathname === '/'
        ? r.fulfill({ status: 200, contentType: 'text/html', body: html })
        : r.fulfill({ status: 404, body: '' })
    )
    await page.goto('http://site.example/')
    const details = await page.evaluate(readDetails)
    const of = (id) => details[id].pictures.map((p) => [p.file, p.via, p.behind])
    assert.deepEqual(of('band'), [['media/pool-water.jpg', 'background', true]])
    assert.deepEqual(of('solid'), [])
    assert.deepEqual(of('card'), [
      ['media/coach.jpg', 'img', false],
      ['media/lane.jpg', 'background', false]
    ])
  } finally {
    await browser.close()
  }
})

test('a picture no frame holds becomes a frame that says it cannot be written; the gate names it until then', () => {
  const map = {
    slots: [
      { key: 'module-3.1', entity: 'module-3', type: 'image', sample: 'media/coach.jpg#editor?width=1' }
    ]
  }
  const water = {
    position: 0,
    file: 'media/pool-water.jpg',
    via: 'background',
    painter: 'div.layer',
    behind: true,
    box: { width: 800, height: 600 }
  }
  const readings = new Map([
    ['band', { pictures: [water] }],
    ['body', { pictures: [{ ...water }] }],
    [
      'card',
      {
        pictures: [
          {
            position: 0,
            file: 'media/coach.jpg',
            via: 'img',
            painter: 'img',
            behind: false,
            box: { width: 120, height: 120 }
          }
        ]
      }
    ]
  ])
  const kit = {
    blocks: [
      { id: 'band', frames: [] },
      { id: 'body', frames: [] },
      { id: 'card', frames: [{ id: 'block-3.1', picture: 'media/coach.jpg', faces: false }] }
    ]
  }
  const failed = []
  assert.equal(imagesWithoutFrame({ kit, map, readings, fail: (...f) => failed.push(f) }), 2)
  assert.deepEqual(
    failed.map((f) => f[1]),
    ['blocks[band] media/pool-water.jpg', 'blocks[body] media/pool-water.jpg']
  )
  assert.equal(pictureFrames(kit, map, readings), 2)
  const [band, body] = [kit.blocks[0].frames[0], kit.blocks[1].frames[0]]
  assert.deepEqual(
    [band.id, band.shownAs, band.paintedBehind, band.writable, band.canHide, band.twinOf],
    ['band.picture-1', 'background', true, false, true, null]
  )
  assert.match(band.writableReason, /no content map slot/)
  assert.equal(body.twinOf, 'band.picture-1')
  assert.equal(
    imagesWithoutFrame({ kit, map, readings, fail: () => assert.fail('every picture has a frame') }),
    0
  )
})
