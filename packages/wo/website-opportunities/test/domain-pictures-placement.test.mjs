import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cropBox,
  drawPlan,
  fitOf,
  MAX_SCALE,
  outputSize,
  planPlacement
} from '../domain/pictures/placement.mjs'
import { labelPicture, nearCopies } from '../domain/pictures/picture-labels.mjs'

const group = (
  id,
  role,
  {
    routes = ['homepage'],
    home = routes.includes('homepage'),
    topic = [],
    demo = { width: 1920, height: 800 }
  } = {}
) => ({
  id,
  file: id,
  role,
  home,
  routes,
  occurrences: [{ key: `${id}.0`, entity: 'module-1', label: id, sample: id }],
  topic,
  demo
})
const pic = (id, width, height, caption, extra = {}) => labelPicture({ id, width, height, caption, ...extra })

test('a hero takes a wide picture of the place; a small social picture never stands in for a 1920px slide (C9)', () => {
  const plan = planPlacement({
    groups: [group('slide-1', 'hero')],
    labels: [
      pic('small', 590, 443, 'our terrace on the beach'),
      pic('wide', 2048, 1365, 'our terrace on the beach at sunset')
    ]
  })
  assert.deepEqual(
    plan.placements.map((p) => [p.groupId, p.mediaId]),
    [['slide-1', 'wide']]
  )
  const alone = planPlacement({
    groups: [group('slide-1', 'hero')],
    labels: [pic('small', 590, 443, 'our terrace on the beach')]
  })
  assert.equal(alone.placements.length, 0)
  assert.equal(alone.unfilled[0].action, 'placeholder')
  assert.match(alone.unfilled[0].reason, /1120px/)
})

test('the crop never needs more than 1.25× to reach the target, whatever the score', () => {
  const g = group('slide-1', 'hero')
  const target = Math.min(g.demo.width, 1400)
  for (const width of [1000, 1119, 1121, 1400, 3000]) {
    const fit = fitOf(pic('p', width, Math.round(width / 1.6), 'beach terrace'), g)
    const box = cropBox(width, Math.round(width / 1.6), 1920 / 800)
    assert.equal(Boolean(fit), target / box.width <= MAX_SCALE, String(width))
  }
})

test('a poster or menu board never takes a hero, even a wide food one (C10)', () => {
  const plan = planPlacement({
    groups: [group('slide-1', 'hero')],
    labels: [
      pic('poster', 2400, 1350, 'seafood promotion 20% off', {
        features: { top2Share: 0.75, edgeDensity: 0.1 }
      })
    ]
  })
  assert.equal(plan.placements.length, 0)
})

test('a picture the vision model calls a graphic takes no photo place, not even one that allows words (#48)', () => {
  const vision = { subject: 'food', textPresence: 'absent', quality: 'good', isGraphic: true }
  for (const role of ['dish', 'article', 'gallery', 'hero']) {
    const fit = fitOf(pic('g', 2400, 1600, 'grilled fish platter', { vision }), group('g1', role))
    assert.equal(fit, null, role)
  }
  assert.equal(pic('g', 2400, 1600, 'x', { vision }).graphic, true)
  assert.notEqual(
    fitOf(
      pic('p', 2400, 1600, 'grilled fish platter', { vision: { ...vision, isGraphic: false } }),
      group('g1', 'dish')
    ),
    null
  )
})

test('a hero without a vision label must be wide enough to be a photograph; a square food picture is not', () => {
  const plan = planPlacement({
    groups: [group('slide-1', 'hero', { demo: { width: 1400, height: 1400 } })],
    labels: [pic('sq', 1600, 1600, 'grilled fish')]
  })
  assert.equal(plan.placements.length, 0)
})

test('most constrained first: the Sea food dishes get the seafood before a general section takes it (C5)', () => {
  const groups = [
    group('about-main', 'section-main', {
      routes: ['about-us'],
      topic: ['welcome'],
      demo: { width: 1000, height: 1000 }
    }),
    group('fd-1', 'dish', { routes: ['menu'], topic: ['sea', 'food'], demo: { width: 600, height: 600 } }),
    group('fd-2', 'dish', { routes: ['menu'], topic: ['sea', 'food'], demo: { width: 600, height: 600 } }),
    group('fd-3', 'dish', { routes: ['menu'], topic: ['sea', 'food'], demo: { width: 600, height: 600 } })
  ]
  const labels = [
    pic('crab', 1080, 1080, 'grilled crab with tamarind seafood'),
    pic('squid', 1080, 1080, 'squid seafood'),
    pic('prawn', 1080, 1080, 'prawns seafood'),
    pic('room', 1200, 1200, 'our cozy dining room interior')
  ]
  const plan = planPlacement({ groups, labels })
  const at = new Map(plan.placements.map((p) => [p.groupId, p.mediaId]))
  assert.deepEqual([at.get('fd-1'), at.get('fd-2'), at.get('fd-3')].sort(), ['crab', 'prawn', 'squid'])
  assert.equal(at.get('about-main'), 'room')
})

test('a dish place takes only food, and a dessert section asks for desserts: no picture of another subject (C6, C13)', () => {
  const groups = [
    group('ic-1', 'dish', { routes: ['menu'], topic: ['icream', 'juice'], demo: { width: 600, height: 600 } })
  ]
  const plan = planPlacement({
    groups,
    labels: [pic('beach', 1200, 1200, 'beach sunset view'), pic('steak', 1200, 1200, 'steak dinner')]
  })
  assert.equal(plan.placements.length, 0)
  assert.equal(plan.unfilled[0].action, 'placeholder')
  const sweet = planPlacement({
    groups,
    labels: [pic('steak', 1200, 1200, 'steak dinner'), pic('gelato', 1200, 1200, 'homemade gelato dessert')]
  })
  assert.equal(sweet.placements[0].mediaId, 'gelato')
})

test('never one picture twice on a page, nor a near-copy of one already there (A4)', () => {
  const groups = [1, 2, 3].map((n) =>
    group(`g${n}`, 'gallery', { routes: ['gallery'], demo: { width: 800, height: 600 } })
  )
  const labels = [
    pic('a', 1600, 1200, 'seafood', { dhash: 'ffffffffffffffff' }),
    pic('a-copy', 800, 600, 'seafood', { dhash: 'fffffffffffffff0' }),
    pic('b', 1600, 1200, 'cocktails', { dhash: '0783719562751226' })
  ]
  const plan = planPlacement({ groups, labels, clusterOf: nearCopies(labels).clusterOf })
  const ids = plan.placements.map((p) => p.mediaId)
  assert.equal(ids.length, 2)
  assert.ok(!(ids.includes('a') && ids.includes('a-copy')))
  assert.equal(plan.unfilled.length, 1)
})

test('a space picture of the inside may be shown again on another page; a dish picture never is (C6)', () => {
  const groups = [
    group('slide-1', 'hero', { demo: { width: 1920, height: 900 } }),
    group('contact-bg', 'cta', { routes: ['contact'], demo: { width: 900, height: 600 } })
  ]
  const plan = planPlacement({ groups, labels: [pic('room', 2400, 1600, 'our dining room interior')] })
  assert.deepEqual(
    plan.placements.map((p) => [p.groupId, p.mediaId, p.reused]),
    [
      ['slide-1', 'room', false],
      ['contact-bg', 'room', true]
    ]
  )
  const dishes = planPlacement({
    groups: [
      group('fd-1', 'dish', { routes: ['menu'], demo: { width: 600, height: 600 } }),
      group('fd-x', 'dish', { routes: ['offers'], demo: { width: 600, height: 600 } })
    ],
    labels: [pic('crab', 1080, 1080, 'crab seafood')]
  })
  assert.equal(dishes.placements.length, 1)
})

test('the output size is never larger than the crop nor the demo, and keeps the demo’s shape within 1%', () => {
  const box = cropBox(590, 443, 1920 / 800)
  const out = outputSize(box, 1920 / 800, 1920)
  assert.ok(out.width <= box.width && out.height <= box.height)
  assert.ok(Math.abs(out.width / out.height - 2.4) <= 0.024)
  assert.deepEqual(outputSize(cropBox(4000, 3000, 1.5), 1.5, 1200), { width: 1200, height: 800 })
})

test('inside a cluster the assignment is the best as a whole, as good as trying every one (small fixture)', () => {
  // Greedy by place would give the strong all-rounder to the first dish and starve the second.
  const groups = [
    group('d1', 'dish', { routes: ['menu'], topic: ['sea', 'food'], demo: { width: 600, height: 600 } }),
    group('d2', 'dish', { routes: ['menu'], topic: ['icream'], demo: { width: 600, height: 600 } })
  ]
  const labels = [
    pic('gelato-seafood', 1200, 1200, 'gelato dessert after seafood'),
    pic('crab', 1200, 1200, 'crab seafood')
  ]
  const plan = planPlacement({ groups, labels })
  const at = new Map(plan.placements.map((p) => [p.groupId, p.mediaId]))
  assert.equal(at.get('d1'), 'crab')
  assert.equal(at.get('d2'), 'gelato-seafood')
  // Brute force over the 2 × 2 instance: the plan's total equals the best total.
  const s = (l, g) => fitOf(l, g)?.score ?? -Infinity
  const best = Math.max(
    s(labels[0], groups[0]) + s(labels[1], groups[1]),
    s(labels[1], groups[0]) + s(labels[0], groups[1])
  )
  const total = plan.placements.reduce((a, p) => a + p.score, 0)
  assert.ok(Math.abs(total - best) < 1e-6)
})

test('the same input in any order gives the same plan', () => {
  const groups = [
    group('slide-1', 'hero'),
    group('g1', 'gallery', { routes: ['gallery'], demo: { width: 800, height: 600 } })
  ]
  const labels = [
    pic('x', 2400, 1600, 'terrace view'),
    pic('y', 1600, 1200, 'seafood'),
    pic('z', 1600, 1200, 'cocktails')
  ]
  assert.deepEqual(
    planPlacement({ groups, labels }),
    planPlacement({ groups, labels: [...labels].reverse() })
  )
})

test('a banner of another page does not take the food a dish grid needs: only the home page’s top pictures choose first', () => {
  const groups = [
    group('slide-1', 'hero', { demo: { width: 1920, height: 960 } }),
    group('banner-blog', 'banner', { routes: ['blog'], demo: { width: 1200, height: 800 } }),
    group('fd-1', 'dish', { routes: ['menu'], topic: ['sea', 'food'], demo: { width: 600, height: 600 } }),
    group('fd-2', 'dish', { routes: ['menu'], topic: ['sea', 'food'], demo: { width: 600, height: 600 } })
  ]
  const labels = [
    pic('crab', 1300, 1300, 'crab seafood'),
    pic('squid', 1300, 1300, 'squid seafood'),
    pic('room', 2000, 1000, 'dining room interior')
  ]
  const at = new Map(planPlacement({ groups, labels }).placements.map((p) => [p.groupId, p.mediaId]))
  // The hero takes the room; the blog's banner may not repeat it (not a space picture) and the dishes keep their food.
  assert.equal(at.get('slide-1'), 'room')
  assert.deepEqual([at.get('fd-1'), at.get('fd-2')].sort(), ['crab', 'squid'])
  assert.equal(at.get('banner-blog'), undefined)
})

test('drawing (plan §8): only an empty hero, banner or background; a real picture that only lacks size is extended first', () => {
  const groups = [
    group('slide-1', 'hero', { demo: { width: 1920, height: 824 } }),
    group('slide-2', 'hero', { demo: { width: 1920, height: 824 } }),
    group('fd-1', 'dish', { routes: ['menu'], topic: ['sea', 'food'], demo: { width: 600, height: 600 } }),
    group('fd-2', 'dish', { routes: ['menu'], topic: ['sea', 'food'], demo: { width: 600, height: 600 } })
  ]
  const v = (subject) => ({ subject, textPresence: 'absent', quality: 'good' })
  const labels = [
    pic('terrace', 590, 443, '', { vision: v('exterior') }),
    pic('room', 590, 590, '', { vision: v('interior') }),
    pic('poster', 590, 590, '', { vision: { subject: 'poster', textPresence: 'present' } }),
    pic('crab', 590, 590, '', { vision: v('food') })
  ]
  const plan = planPlacement({ groups, labels })
  assert.deepEqual(
    plan.unfilled.map((u) => u.groupId),
    ['slide-1', 'slide-2', 'fd-2']
  )
  const draws = drawPlan({ plan, groups, labels })
  // The dish is never drawn; each slide gets its own picture to extend, the outside first.
  assert.deepEqual(
    draws.map((d) => [d.groupId, d.mode, d.sourceId]),
    [
      ['slide-1', 'outpaint', 'terrace'],
      ['slide-2', 'outpaint', 'room']
    ]
  )
  assert.ok(draws.every((d) => d.aspect > 2.3 && d.aspect < 2.34))
})

test('drawing: with nothing to extend a scene is drawn from the place’s own photos as references; at most three per site', () => {
  const groups = [1, 2, 3, 4].map((n) =>
    group(`bg-${n}`, 'background', { routes: ['offers'], home: false, demo: { width: 1920, height: 1080 } })
  )
  const labels = [
    labelPicture({
      id: 'tall',
      width: 300,
      height: 900,
      vision: { subject: 'interior', textPresence: 'absent' }
    }),
    labelPicture({
      id: 'out',
      width: 300,
      height: 900,
      vision: { subject: 'exterior', textPresence: 'absent' }
    }),
    labelPicture({
      id: 'menu',
      width: 300,
      height: 900,
      vision: { subject: 'menu-board', textPresence: 'present' }
    })
  ]
  const plan = planPlacement({ groups, labels })
  const draws = drawPlan({ plan, groups, labels })
  assert.equal(draws.length, 3)
  assert.ok(draws.every((d) => d.mode === 'scene'))
  assert.deepEqual(draws[0].referenceIds, ['out', 'tall'])
  assert.equal(drawPlan({ plan, groups, labels, max: 1 }).length, 1)
  // No photo of the place at all: nothing is drawn from nothing.
  assert.equal(drawPlan({ plan, groups, labels: [labels[2]] }).length, 0)
})

test('the output shape is within 0.005 of the demo’s in absolute terms: a site refuses more than 0.02', () => {
  for (const [w, h, aspect] of [
    [1376, 768, 1920 / 824],
    [590, 443, 1920 / 824],
    [4000, 3000, 656 / 386],
    [1080, 1350, 1107 / 870]
  ]) {
    const out = outputSize(cropBox(w, h, aspect), aspect, 1920)
    assert.ok(Math.abs(out.width / out.height - aspect) <= 0.005, `${w}x${h} → ${out.width}x${out.height}`)
  }
})

test('non-food subjects: placement picks work-result/product for item cards (dish role) and room/equipment for hero and about', () => {
  const v = (subject, extra = {}) => ({ subject, textPresence: 'absent', quality: 'good', ...extra })
  const groups = [
    group('hero-1', 'hero', { demo: { width: 1600, height: 900 } }),
    group('about-1', 'section-main', {
      routes: ['about'],
      home: false,
      demo: { width: 1200, height: 900 }
    }),
    group('service-card-1', 'dish', {
      routes: ['services'],
      home: false,
      topic: ['services'],
      demo: { width: 800, height: 800 }
    }),
    group('service-card-2', 'dish', {
      routes: ['services'],
      home: false,
      topic: ['services'],
      demo: { width: 800, height: 800 }
    })
  ]
  const labels = [
    pic('studio-room', 2000, 1200, '', { vision: v('room', { heroWorthy: true }) }),
    pic('gym-gear', 1600, 1200, '', { vision: v('equipment') }),
    pic('nail-art', 1200, 1200, '', { vision: v('work-result') }),
    pic('shampoo-bottle', 1200, 1200, '', { vision: v('product') })
  ]
  const plan = planPlacement({ groups, labels })
  const at = new Map(plan.placements.map((p) => [p.groupId, p.mediaId]))
  assert.equal(at.get('hero-1'), 'studio-room')
  assert.equal(at.get('about-1'), 'gym-gear')
  assert.deepEqual([at.get('service-card-1'), at.get('service-card-2')].sort(), [
    'nail-art',
    'shampoo-bottle'
  ])
})
