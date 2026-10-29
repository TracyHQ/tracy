/**
 * The restaurant's own photographs in the demo pictures' places: the demo files measured on the site, the plan made once
 * and kept, each photograph cut to its place's exact shape, a placeholder where nothing fits, and what the site holds
 * read back afterwards.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import sharp from 'sharp'

import {
  keptPages,
  pictureReport,
  realPicturesOf,
  shapeReal
} from '../src/sites/brief-engines/real-pictures.js'

const CONTRACT = new URL(
  '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-restaurant/j6/1.0.5/content-map.json',
  import.meta.url
)
const contentMap = JSON.parse(readFileSync(CONTRACT, 'utf8'))

const jpeg = (width, height, background = '#886644') =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer()

/** The demo files of ja-restaurant as the site serves them: slides 1920×900, dishes 600×600, the rest 800×600. */
async function demoSite() {
  const sizes = (file) =>
    /slideshow/.test(file) ? [1920, 900] : /food|icream/.test(file) ? [600, 600] : [800, 600]
  const cache = new Map()
  const bytes = async (file) => {
    if (!cache.has(file)) {
      if (file.endsWith('.png')) {
        cache.set(
          file,
          await sharp({
            create: { width: 500, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
          })
            .png()
            .toBuffer()
        )
      } else cache.set(file, await jpeg(...sizes(file)))
    }
    return cache.get(file)
  }
  return { siteFile: bytes, siteBytes: bytes }
}

function realOf(pictures) {
  const plans = []
  const byId = new Map(pictures.map((p) => [p.id, p]))
  return {
    plans,
    real: {
      buildId: 'build-1',
      plan: null,
      colours: ['#b5452a'],
      pictures: pictures.map(({ bytes: _bytes, ...p }) => p),
      bytes: async (id) => byId.get(id)?.bytes ?? null
    },
    realPictures: {
      recordPlan: async (_id, plan) => {
        plans.push(plan)
        return plans[0]
      }
    }
  }
}

const picture = async (id, width, height, caption, background) => ({
  id,
  width,
  height,
  caption,
  source: 'instagram',
  bytes: await jpeg(width, height, background)
})

test('no reader, no build behind the site, or a reader that fails: nothing changes for the site', async () => {
  const ctx = { siteKey: 'plain.tracy.test', email: 'a@tracy.test', note() {} }
  assert.equal(await realPicturesOf(null, ctx), null)
  assert.equal(await realPicturesOf({ forSite: async () => null }, ctx), null)
  assert.equal(await realPicturesOf({ forSite: async () => Promise.reject(new Error('down')) }, ctx), null)
  assert.equal(await realPicturesOf({ forSite: async () => ({ pictures: [] }) }, ctx), null)
})

test('ja-restaurant: wide photographs take the slides, food takes the dishes, the rest a placeholder; the plan is kept once', async () => {
  const pictures = [
    await picture('terrace', 2400, 1350, 'Our terrace on the beach at sunset', '#336699'),
    await picture('room', 2048, 1152, 'The dining room interior tonight', '#996633'),
    await picture('bar', 2000, 1125, 'Cocktails at the rooftop bar outside view', '#663399'),
    await picture('squid', 1080, 1080, 'Grilled squid seafood', '#aa5522'),
    await picture('crab', 1080, 1080, 'Crab with tamarind seafood', '#bb6633'),
    await picture('small', 400, 300, 'beach', '#225588')
  ]
  const { real, realPictures, plans } = realOf(pictures)
  const site = await demoSite()
  const notes = []
  const shaped = await shapeReal({
    real,
    contentMap,
    cms: 'joomla',
    pages: keptPages(null),
    ...site,
    realPictures,
    note: (n) => notes.push(n)
  })
  assert.equal(plans.length, 1)
  const at = new Map(shaped.plan.placements.map((p) => [p.groupId, p.mediaId]))
  assert.deepEqual(
    ['slide-1', 'slide-2', 'slide-3'].map((n) => at.get(`images/joomlart/slideshow/${n}.jpg`)).sort(),
    ['bar', 'room', 'terrace']
  )
  const dishes = [...at.entries()]
    .filter(([g]) => /\/food\//.test(g))
    .map(([, m]) => m)
    .sort()
  assert.deepEqual(dishes, ['crab', 'squid'])
  // chef.png measured transparent: a cut-out, never replaced.
  assert.ok(
    shaped.map.never.some((n) => n.file === 'images/joomlart/hero/chef.png' && /cut-out/.test(n.reason))
  )
  // Every place got bytes of exactly its demo's shape: photographs and placeholders alike.
  for (const s of shaped.shaped) {
    const meta = await sharp(s.bytes).metadata()
    const demo = /slideshow/.test(s.group.sample)
      ? 1920 / 900
      : /food|icream/.test(s.group.sample)
        ? 1
        : 800 / 600
    assert.ok(Math.abs(meta.width / meta.height - demo) <= 0.01 * demo, s.group.sample)
    assert.match(s.hash, /^[0-9a-f]{64}$/)
  }
  const placeholders = shaped.shaped.filter((s) => ['placeholder', 'blank'].includes(s.receipt.kind))
  assert.ok(placeholders.length > 0)
  assert.equal(placeholders.length, shaped.plan.unfilled.length)
  assert.ok(shaped.shaped.filter((s) => s.receipt.kind === 'photo').every((s) => s.receipt.origin === 'real'))
})

test('a second run places what the first chose: the kept plan is read, not made again', async () => {
  const pictures = [await picture('terrace', 2400, 1350, 'terrace beach view', '#336699')]
  const { real } = realOf(pictures)
  const kept = {
    placements: [
      {
        groupId: 'images/joomlart/slideshow/slide-2.jpg',
        mediaId: 'terrace',
        origin: 'real',
        crop: {
          aspect: 1920 / 900,
          source: { width: 2400, height: 1125 },
          output: { width: 1920, height: 900 },
          strategy: 'centre'
        }
      }
    ],
    unfilled: [],
    unused: []
  }
  const shaped = await shapeReal({
    real: { ...real, plan: kept },
    contentMap,
    cms: 'joomla',
    pages: keptPages(null),
    ...(await demoSite()),
    realPictures: { recordPlan: async () => assert.fail('a kept plan is never written again') },
    note() {}
  })
  assert.deepEqual(
    shaped.shaped.map((s) => s.group.sample),
    ['images/joomlart/slideshow/slide-2.jpg']
  )
})

test('the report: verified when the site holds the path, uploaded when the write set it aside, and every place still on its demo', () => {
  const group = (file, keys) => ({
    id: file,
    file,
    routes: ['homepage'],
    occurrences: keys.map((key) => ({ key }))
  })
  const shaped = {
    map: {
      groups: [group('a.jpg', ['k1']), group('b.jpg', ['k2']), group('c.jpg', ['k3'])],
      never: [{ file: 'logo.png', reason: 'a logo' }]
    },
    plan: { placements: [{}, {}], unfilled: [], unused: ['x'] },
    shaped: [
      { group: { sample: 'a.jpg', slots: [{ key: 'k1' }] }, hash: 'h1', receipt: { kind: 'photo' } },
      { group: { sample: 'b.jpg', slots: [{ key: 'k2' }] }, hash: 'h2', receipt: { kind: 'photo' } }
    ]
  }
  const { receipts, report } = pictureReport({
    shaped,
    values: { k1: 'images/tracy-content/h1.jpg', k2: 'images/tracy-content/h2.jpg' },
    refused: new Set(['k2']),
    readback: new Map([
      ['k1', 'images/tracy-content/h1.jpg'],
      ['k2', 'b.jpg'],
      ['k3', 'c.jpg#joomlaImage://local-images/c.jpg?width=1&height=1']
    ])
  })
  assert.equal(receipts['a.jpg'].state, 'verified')
  assert.equal(receipts['b.jpg'].state, 'uploaded')
  assert.deepEqual(
    report.demoLeft.map((d) => d.file),
    ['b.jpg', 'c.jpg']
  )
  assert.equal(report.verified, 1)
})

test('the pages kept: the home page always, a picked page and the pages under it', () => {
  const { keepRoute, homeRoute } = keptPages({
    all: [{ id: 'homepage', home: true }, { id: 'menu' }, { id: 'gallery' }],
    picked: ['menu']
  })
  assert.equal(homeRoute, 'homepage')
  assert.ok(keepRoute('homepage'))
  assert.ok(keepRoute('menu/menu-with-image'))
  assert.ok(!keepRoute('gallery'))
  assert.ok(keptPages(undefined).keepRoute('anything'))
})

test('the home page is read for demo pictures no slot names: the agent is told about them', () => {
  const shaped = {
    map: {
      groups: [
        {
          id: 'images/joomlart/hero/a.jpg',
          file: 'images/joomlart/hero/a.jpg',
          routes: ['home'],
          occurrences: []
        }
      ],
      never: [{ file: 'images/joomlart/logo.png', reason: 'a logo' }]
    },
    plan: { placements: [], unfilled: [], unused: [] },
    shaped: []
  }
  const html = `<img src="/images/joomlart/services/item-3.jpg"><div style="background-image:url('images/joomlart/others/bg.jpg')"></div>
    <img src="/images/joomlart/logo.png"><img src="/images/tracy-content/abc.jpg"><img srcset="/images/joomlart/services/item-5.jpg 2x">`
  const { report } = pictureReport({ shaped, values: {}, refused: new Set(), readback: null, homeHtml: html })
  assert.deepEqual(report.demoOutside, [
    'images/joomlart/others/bg.jpg',
    'images/joomlart/services/item-3.jpg',
    'images/joomlart/services/item-5.jpg'
  ])
})

test('an empty slide is extended from a real photo when a picture model is set; drawn once, read from the cache after (§8)', async () => {
  const small = await picture('terrace', 590, 443, 'Our terrace on the beach at sunset', '#336699')
  const { real, realPictures } = realOf([
    { ...small, vision: { subject: 'exterior', textPresence: 'absent', quality: 'good' } }
  ])
  const kept = new Map()
  const drawing = {
    get: async (key) => kept.get(key) ?? null,
    put: async (key, bytes) => kept.set(key, { bytes })
  }
  const site = await demoSite()
  let calls = 0
  const chat = async () => {
    calls += 1
    return { images: [{ mime: 'image/jpeg', bytes: await jpeg(2400, 1125) }], usage: { cost: 0.034 } }
  }
  const run = () =>
    shapeReal({
      real: { ...real, drawing },
      contentMap,
      cms: 'joomla',
      pages: keptPages(null),
      ...site,
      realPictures,
      note() {},
      drawDoor: { url: 'https://draw.test', key: 'k', imageModel: 'm' },
      chat
    })
  const first = await run()
  const slides = first.shaped.filter((s) => /slideshow/.test(s.group.sample))
  const drawnSlides = slides.filter((s) => s.receipt.kind === 'drawn')
  assert.ok(drawnSlides.length >= 1)
  assert.equal(drawnSlides[0].receipt.origin, 'outpainted')
  assert.deepEqual(drawnSlides[0].receipt.referenceIds, ['terrace'])
  assert.equal(drawnSlides[0].receipt.costUsd, 0.034)
  // Never more than three drawn, and no dish place is ever drawn.
  assert.ok(first.shaped.filter((s) => s.receipt.kind === 'drawn').length <= 3)
  assert.ok(!first.shaped.some((s) => s.receipt.kind === 'drawn' && /food|icream/.test(s.group.sample)))
  const before = calls
  await run()
  assert.equal(calls, before, 'the second run reads the cache')
})

test('a drawing that comes back too small for its place takes a placeholder and says so', async () => {
  const small = await picture('terrace', 590, 443, 'terrace', '#336699')
  const { real, realPictures } = realOf([
    { ...small, vision: { subject: 'exterior', textPresence: 'absent', quality: 'good' } }
  ])
  const notes = []
  const shaped = await shapeReal({
    real,
    contentMap,
    cms: 'joomla',
    pages: keptPages(null),
    ...(await demoSite()),
    realPictures,
    note: (n) => notes.push(n),
    drawDoor: { url: 'https://draw.test', key: 'k', imageModel: 'm' },
    chat: async () => ({ images: [{ mime: 'image/jpeg', bytes: await jpeg(700, 330) }], usage: {} })
  })
  assert.ok(notes.some((n) => /came back too small/.test(n)))
  assert.ok(!shaped.shaped.some((s) => s.receipt.kind === 'drawn'))
})

test('ja-impact: each place is cut to the demo file the site serves, not the size the contract declares', async () => {
  const impactMap = JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-impact/j6/1.0.3/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  const served = async () => jpeg(1920, 824)
  const { real, realPictures } = realOf([
    {
      ...(await picture('front', 2400, 1600, 'front')),
      vision: { subject: 'exterior', textPresence: 'absent', quality: 'good' }
    },
    {
      ...(await picture('room', 2400, 1600, 'room')),
      vision: { subject: 'interior', textPresence: 'absent', quality: 'good' }
    }
  ])
  const shaped = await shapeReal({
    real,
    contentMap: impactMap,
    cms: 'joomla',
    pages: keptPages(null),
    siteFile: served,
    siteBytes: served,
    realPictures,
    note() {}
  })
  const item2 = shaped.shaped.find((s) => s.group.sample === 'images/joomlart/hero/item-2.jpg')
  const meta = await sharp(item2.bytes).metadata()
  assert.ok(Math.abs(meta.width / meta.height - 1920 / 824) <= 0.005, `${meta.width}x${meta.height}`)
})

test('what the vision model cost is put in the run’s timings', async () => {
  const times = {}
  const ctx = { siteKey: 's', email: 'e', note() {}, time: (k, v) => (times[k] = v) }
  await realPicturesOf(
    {
      forSite: async () => ({
        pictures: [{ id: 'a' }],
        vision: { calls: 2, tokens: 900, ms: 3100, labelled: 12 }
      })
    },
    ctx
  )
  assert.deepEqual(times, { visionCalls: 2, visionTokens: 900, visionMs: 3100, visionLabelled: 12 })
})

test('a picture model that never answers costs the place its drawing, never the Apply its words', async () => {
  const small = await picture('terrace', 590, 443, 'terrace', '#336699')
  const { real, realPictures } = realOf([
    { ...small, vision: { subject: 'exterior', textPresence: 'absent', quality: 'good' } }
  ])
  const notes = []
  // A ref'd timer: `AbortSignal.timeout` would let the test's event loop end before it fires.
  const apply = new AbortController()
  setTimeout(() => apply.abort(), 100)
  const started = Date.now()
  const shaped = await shapeReal({
    real,
    contentMap,
    cms: 'joomla',
    pages: keptPages(null),
    ...(await demoSite()),
    realPictures,
    note: (n) => notes.push(n),
    drawDoor: { url: 'https://draw.test', key: 'k', imageModel: 'm' },
    chat: () => new Promise(() => {}),
    drawMs: 60_000,
    // The Apply's deadline comes first: what is still drawing is given up there.
    signal: apply.signal
  })
  assert.ok(Date.now() - started < 10_000, 'the run did not wait on the model')
  assert.ok(
    notes.some((n) => /could not be drawn: the picture took too long/.test(n)),
    notes.join('\n')
  )
  assert.ok(!shaped.shaped.some((s) => s.receipt.kind === 'drawn'))
})

test('hero fallback enforces real-only and outpaint-only before any drawing or cache access', async () => {
  const { websiteOpportunitiesDomain } = await import('website-opportunities/src/domain-loader.js')
  const domain = await websiteOpportunitiesDomain()
  const small = await picture('terrace', 590, 443, 'Our terrace at sunset', '#336699')
  const { real, realPictures } = realOf([
    { ...small, vision: { subject: 'exterior', textPresence: 'absent', quality: 'good' } }
  ])
  const site = await demoSite()
  for (const mode of ['real-only', 'outpaint', 'outpaint-and-scene']) {
    let calls = 0,
      cacheReads = 0
    const result = await shapeReal({
      real: {
        ...real,
        picturePolicy: { missingHeroMode: mode },
        drawing: {
          get: async () => {
            cacheReads++
            return null
          },
          put: async () => {}
        }
      },
      realPictures,
      contentMap,
      cms: 'joomla',
      pages: keptPages(null),
      ...site,
      note() {},
      // Force a scene proposal to prove outpaint-only cannot dispatch it.
      loadDomain: async () => ({
        ...domain,
        drawPlan: (args) => domain.drawPlan(args).map((d) => ({ ...d, mode: 'scene' }))
      }),
      drawDoor: { url: 'https://synthetic.invalid', key: 'synthetic', imageModel: 'synthetic' },
      chat: async () => {
        calls++
        return { images: [{ mime: 'image/jpeg', bytes: await jpeg(2400, 1125) }] }
      }
    })
    const drawn = result.shaped.filter((s) => s.receipt.kind === 'drawn')
    if (mode === 'outpaint-and-scene') {
      assert.ok(calls > 0)
      assert.ok(drawn.length > 0)
      assert.ok(drawn.every((s) => s.receipt.origin === 'generated'))
    } else {
      assert.equal(calls, 0)
      assert.equal(cacheReads, 0)
      assert.equal(drawn.length, 0)
      assert.ok(result.shaped.some((s) => s.receipt.kind === 'placeholder'))
    }
  }
})

// 🔒 A card's picture is its own entity's (plan §7). Squid's card has its photo; the next dish card's entity has none: it
// takes the placeholder, never the crab photo that would fit it, and the receipt says which dish the photo shows.
test('a slot plan binds each dish card to its own entity’s photo; a card whose entity has none takes the placeholder', async () => {
  const pictures = [
    await picture('squid', 1080, 1080, 'Grilled squid seafood', '#aa5522'),
    await picture('crab', 1080, 1080, 'Crab with tamarind seafood', '#bb6633')
  ]
  const site = await demoSite()
  const free = await shapeReal({
    ...realOf(pictures),
    contentMap,
    cms: 'joomla',
    pages: keptPages(null),
    ...site,
    note: () => {}
  })
  const food = free.map.groups.filter((g) => /\/food\//.test(g.file))
  assert.ok(food.length >= 2)
  const [first, second] = food
  const bound = {
    [first.occurrences[0].key]: 'squid',
    [second.occurrences[0].key]: null
  }
  const { real, realPictures } = realOf(pictures)
  const shaped = await shapeReal({
    real,
    contentMap,
    cms: 'joomla',
    pages: keptPages(null),
    ...site,
    realPictures,
    note: () => {},
    bound
  })
  const at = (g) => shaped.shaped.find((s) => s.group.sample === g.file)
  assert.equal(at(first).receipt.mediaId, 'squid')
  assert.equal(at(second).receipt.kind, 'placeholder')
  assert.ok(
    shaped.plan.unfilled.some((u) => u.groupId === second.id && /no picture of its own/.test(u.reason))
  )
})
