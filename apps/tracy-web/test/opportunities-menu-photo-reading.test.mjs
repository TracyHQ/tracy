import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BudgetExceededError } from 'website-opportunities/src/cost-ledger.js'
import { visionCostCents } from 'website-opportunities/src/cost-prices.js'
import {
  MENU_PHOTOS_PER_PLACE,
  MENU_PHOTO_SYSTEM,
  countryOf,
  menuPhotoCandidates,
  menuPhotoScope,
  menuPhotoVersion,
  menuVisionDoorFor,
  menuVisionDoorOf,
  parseMenuPhotoAnswer,
  printedPrice,
  readMenuPhotos
} from 'website-opportunities/src/menu-photo-reading.js'
import { mergeMenuItems } from 'website-opportunities/src/menu-items.js'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const AT = Date.parse('2026-10-23T10:00:00.000Z')
const ready = {
  state: 'ready',
  door: { url: 'https://api.test/chat/completions', key: 'k', model: 'deepseek-flash', effort: 'low' }
}
const photo = (n, extra = {}) => ({
  id: `m${n}`,
  source_url: `https://g.test/p${n}`,
  sha256: `sha${n}`,
  ...extra
})
const reply = (content, usage = { prompt_tokens: 1000, completion_tokens: 4000 }) => ({
  ok: true,
  status: 200,
  json: async () => ({ id: 'r1', choices: [{ message: { content } }], usage })
})
const answer = (items) => reply(JSON.stringify({ items }))

function harness({ responses, chargeImpl } = {}) {
  const calls = []
  const specs = []
  const settled = []
  const queue = [...(responses ?? [])]
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  const charge = async (spec, call) => {
    specs.push(spec)
    if (chargeImpl) await chargeImpl(spec, specs.length)
    const result = await call()
    settled.push(spec.actualCents(result))
    return result
  }
  const image = async () => 'data:image/jpeg;base64,AAAA'
  return { calls, specs, settled, input: { fetchImpl, charge, image, now: () => AT } }
}

test('no vision model assigned: the step is skipped as not configured and nothing is called or charged', async () => {
  const h = harness({ responses: [answer([])] })
  const out = await readMenuPhotos({
    ...h.input,
    photos: [photo(1)],
    door: menuVisionDoorOf({ state: 'unassigned' }, woHost)
  })
  assert.equal(out.status, 'not_configured')
  assert.deepEqual(out.items, [])
  assert.equal(h.calls.length, 0)
  assert.equal(h.specs.length, 0)
})

test('an assigned model that cannot read pictures, or whose provider is off, is unavailable, not an error', () => {
  const credential = { apiKey: 'k', baseUrl: 'https://api.deepseek.com', model: 'm' }
  const snapshot = (metadata) => ({ presetId: 'deepseek', metadata })
  assert.deepEqual(
    menuVisionDoorOf({ state: 'ok', credential, snapshot: snapshot({ vision: false }) }, woHost),
    {
      state: 'unavailable',
      reason: 'The assigned model does not read pictures.'
    }
  )
  assert.equal(menuVisionDoorOf({ state: 'disabled' }, woHost).state, 'unavailable')
  const ok = menuVisionDoorOf(
    {
      state: 'ok',
      credential,
      snapshot: snapshot({ vision: true, reasoning: true, reasoningEfforts: ['low', 'high'] })
    },
    woHost
  )
  assert.equal(ok.state, 'ready')
  assert.equal(ok.door.effort, 'low')
  assert.equal(ok.door.url, 'https://api.deepseek.com/chat/completions')
})

test('an earlier reading survives while no vision model is assigned', async () => {
  const held = {
    items: [{ name: 'Tea', source: { kind: 'photo', url: 'https://g.test/p1', sha256: 'sha1' } }],
    reads: [{ kind: 'photo', url: 'https://g.test/p1', status: 'complete', items: 1 }]
  }
  const out = await readMenuPhotos({
    ...harness().input,
    photos: [photo(1)],
    held,
    door: { state: 'not_configured' }
  })
  assert.deepEqual(
    out.items.map((i) => i.name),
    ['Tea']
  )
  assert.equal(out.reads.length, 1)
  assert.equal(out.collected, null)
})

test('photo readings are unverified suggestions sourced to the photo, prices only when printed', async () => {
  const h = harness({
    responses: [
      answer([
        { name: 'Hummus', price: '32', currency: null, section: 'Starters' },
        { name: 'Dover Sole', price: null, currency: null, section: 'Mains' },
        { name: 'Latte', price: '15', currency: 'AED', size: 'large' }
      ])
    ]
  })
  const out = await readMenuPhotos({
    ...h.input,
    photos: [photo(1, { posted_at: '2026-09-01T00:00:00Z' })],
    door: ready,
    country: 'AE'
  })
  assert.equal(out.status, 'complete')
  assert.equal(h.calls[0].body.model, 'deepseek-flash')
  assert.equal(h.calls[0].body.reasoning_effort, 'low')
  assert.equal(h.calls[0].body.messages[1].content[1].type, 'image_url')
  const [hummus, sole, latte] = out.items
  for (const item of out.items) {
    assert.equal(item.verified, false)
    assert.equal(item.source.kind, 'photo')
    assert.equal(item.source.url, 'https://g.test/p1')
    assert.equal(item.source.postedAt, '2026-09-01T00:00:00.000Z')
    assert.equal(item.provenance, 'read from photo')
  }
  assert.deepEqual([hummus.price, hummus.currency, hummus.currencyAssumed], ['32', 'AED', true])
  assert.deepEqual([sole.price, sole.currency], [null, null])
  assert.deepEqual([latte.currency, latte.currencyAssumed, latte.size], ['AED', undefined, 'large'])
  // And through the merge they stay unverified even when a model claimed otherwise.
  assert.ok(mergeMenuItems(out.items).every((i) => i.verified === false))
})

// Lee (24/10/2026): store the printed number, never multiplied; record the scale the MENU states (a header note, a suffix,
// amounts the reader sees are shortened), in any currency; unsure = no scale, said unknown. Tin Lantern Saigon is one case.
const readOne = async (answerBody, country) => {
  const h = harness({ responses: [reply(JSON.stringify(answerBody))] })
  return (await readMenuPhotos({ ...h.input, photos: [photo(1)], door: ready, country })).items
}
const scaled = (items) => items.map((i) => [i.price, i.priceScale])

test('a scale the menu states is recorded beside the printed number, in any currency', async () => {
  // A header note read by the model (VND, Tin Lantern Saigon): glass and bottle are one dish, two sizes.
  const vnd = await readOne(
    {
      isMenu: true,
      priceScale: 1000,
      items: [
        { name: 'CAPTAIN MORGAN GOLD', price: '110', size: '50ML', section: 'RUM 50ML' },
        { name: 'CAPTAIN MORGAN GOLD', price: '1485', size: '750ML', section: 'RUM 50ML' },
        { name: 'BSPOKE', price: null }
      ]
    },
    'VN'
  )
  assert.deepEqual(
    vnd.map((i) => [i.name, i.size ?? null, i.price, i.currency, i.priceScale ?? null]),
    [
      ['CAPTAIN MORGAN GOLD', '50ML', '110', 'VND', 1000],
      ['CAPTAIN MORGAN GOLD', '750ML', '1485', 'VND', 1000],
      ['BSPOKE', null, null, null, null]
    ]
  )
  // A suffix printed on the price itself: rupiah "45rb", won "3만", pesos "1.2M", "110K".
  const idr = await readOne(
    {
      isMenu: true,
      priceScale: null,
      items: [
        { name: 'Es teh', price: '45rb' },
        { name: 'Nasi goreng', price: '65 ribu' }
      ]
    },
    'ID'
  )
  assert.deepEqual(scaled(idr), [
    ['45', 1000],
    ['65', 1000]
  ])
  const krw = await readOne(
    {
      isMenu: true,
      priceScale: null,
      items: [
        { name: '비빔밥', price: '1.2만' },
        { name: 'Soju', price: '5천' }
      ]
    },
    'KR'
  )
  assert.deepEqual(scaled(krw), [
    ['1.2', 10000],
    ['5', 1000]
  ])
  const cop = await readOne(
    {
      isMenu: true,
      priceScale: null,
      items: [
        { name: 'Bandeja', price: '1.2M' },
        { name: 'Tinto', price: '110K' }
      ]
    },
    'CO'
  )
  assert.deepEqual(scaled(cop), [
    ['1.2', 1000000],
    ['110', 1000]
  ])
})

test('full amounts are never scaled: dollars, dirhams, and a menu the reader says prints full amounts', async () => {
  const usd = await readOne(
    {
      isMenu: true,
      priceScale: 1,
      items: [
        { name: 'Latte', price: '4.50' },
        { name: 'Steak', price: '38' }
      ]
    },
    'US'
  )
  assert.deepEqual(scaled(usd), [
    ['4.50', 1],
    ['38', 1]
  ])
  const aed = await readOne(
    {
      isMenu: true,
      items: [
        { name: 'Hummus', price: '32' },
        { name: 'Mixed grill', price: '1,250' }
      ]
    },
    'AE'
  )
  assert.deepEqual(
    scaled(aed),
    [
      ['32', null],
      ['1250', null]
    ],
    'the reader said nothing: unknown, never guessed'
  )
  const vndFull = await readOne(
    { isMenu: true, priceScale: 1, items: [{ name: 'Pho', price: '65.000' }] },
    'VN'
  )
  assert.deepEqual(scaled(vndFull), [['65000', 1]])
  // Small numbers in a currency with large amounts, with no note or suffix: unknown, never a guessed multiplier.
  const vndUnsure = await readOne(
    { isMenu: true, priceScale: null, items: [{ name: 'Mojito', price: '120' }] },
    'VN'
  )
  assert.deepEqual(scaled(vndUnsure), [['120', null]])
})

// Tin Lantern Saigon printed "1.700" in thousands: 1,700 thousand dong, never 1.7. The stored price is the printed number as
// a plain decimal, its separators read from the currency's minor units and the menu's other prices; unsure = as printed,
// scale unknown.
test('a printed price is stored as a plain decimal, separators resolved by the menu and its currency', async () => {
  const vnd = await readOne(
    {
      isMenu: true,
      priceScale: 1000,
      items: [
        { name: 'CHIVAS 18', price: '1.700', size: '750ML' },
        { name: 'MACALLAN 12', price: '2.100', size: '750ML' },
        { name: 'TIGER', price: '65' }
      ]
    },
    'VN'
  )
  assert.deepEqual(scaled(vnd), [
    ['1700', 1000],
    ['2100', 1000],
    ['65', 1000]
  ])
  // A decimal-comma menu in euros: "." groups thousands, "," is the decimal.
  const eur = await readOne(
    {
      isMenu: true,
      priceScale: 1,
      items: [
        { name: 'Menu degustazione', price: '1.700' },
        { name: 'Caffe', price: '2,50' },
        { name: 'Tagliata', price: '1.234,50' }
      ]
    },
    'IT'
  )
  assert.deepEqual(scaled(eur), [
    ['1700', 1],
    ['2.50', 1],
    ['1234.50', 1]
  ])
  // A dot that is a decimal stays one: nothing to resolve, the rule does not fire.
  const usd = await readOne(
    {
      isMenu: true,
      priceScale: 1,
      items: [
        { name: 'Burger', price: '17.00' },
        { name: 'Wine', price: '1,200.00' },
        { name: 'Fries', price: '6' }
      ]
    },
    'US'
  )
  assert.deepEqual(scaled(usd), [
    ['17.00', 1],
    ['1200.00', 1],
    ['6', 1]
  ])
  // A three-decimal currency (dinars): "0.750" on the same menu says the dot is the decimal.
  const kwd = await readOne(
    {
      isMenu: true,
      priceScale: 1,
      items: [
        { name: 'Karak', price: '0.750' },
        { name: 'Machboos', price: '3.500' }
      ]
    },
    'KW'
  )
  assert.deepEqual(scaled(kwd), [
    ['0.75', 1],
    ['3.5', 1]
  ])
  // No currency known and nothing on the menu to tell: kept as printed, its scale unknown.
  const unknown = await readOne(
    { isMenu: true, priceScale: 1000, items: [{ name: 'Set', price: '1.700' }] },
    null
  )
  assert.deepEqual(scaled(unknown), [['1.700', null]])
  // A three-decimal currency with nothing on the menu to tell: the same, never a guess.
  const kwdUnsure = await readOne(
    { isMenu: true, priceScale: 1, items: [{ name: 'Machboos', price: '3.500' }] },
    'KW'
  )
  assert.deepEqual(scaled(kwdUnsure), [['3.500', null]])
})

test('a printed short form states its scale; a full amount, a currency after it or a non-price never invents one', () => {
  const cases = [
    ['110K VND', '110', 1000],
    ['45rb Rp', '45', 1000],
    ['110 ngh\u00ECn', '110', 1000],
    ['5\uCC9C', '5', 1000],
    ['3\uB9CC', '3', 10000],
    ['1.2M', '1.2', 1000000],
    ['2 juta', '2', 1000000],
    ['12.50', '12.50', null],
    ['1,250', '1,250', null],
    ['12 $', '12', null]
  ]
  for (const [text, price, scale] of cases) assert.deepEqual(printedPrice(text), { price, scale }, text)
  for (const text of ['MP', '12oz', '2 for 1', '']) assert.equal(printedPrice(text), null, text)
})

test('the menu prompt asks for the stated scale and one item per size with the size set', () => {
  assert.match(MENU_PHOTO_SYSTEM, /priceScale/)
  assert.match(MENU_PHOTO_SYSTEM, /glass and bottle/i)
  assert.match(MENU_PHOTO_SYSTEM, /never multiply/i)
  assert.doesNotMatch(MENU_PHOTO_SYSTEM, /VND|dong|Vietnam/i, 'no currency is special')
  for (const [given, want] of [
    [1000, 1000],
    [10000, 10000],
    [1000000, 1000000],
    [1, 1],
    [7, null],
    [null, null]
  ])
    assert.equal(
      parseMenuPhotoAnswer(JSON.stringify({ isMenu: true, priceScale: given, items: [] })).priceScale,
      want
    )
})

test('the ledger reserves a ceiling as provider vision and settles at the tokens the answer reports', async () => {
  const h = harness({ responses: [answer([{ name: 'Tea', price: '5' }])] })
  await readMenuPhotos({ ...h.input, photos: [photo(1)], door: ready })
  assert.equal(h.specs[0].operation, 'deepseek-flash')
  assert.ok(h.specs[0].maxCents >= 1)
  assert.equal(
    h.settled[0],
    visionCostCents('deepseek-flash', { promptTokens: 1000, completionTokens: 4000 })
  )
  assert.ok(h.settled[0] <= h.specs[0].maxCents)
})

test('over the budget the step stops cleanly: what was read stays, no further call goes out', async () => {
  const h = harness({
    responses: [answer([{ name: 'Tea', price: '5' }])],
    chargeImpl: async (_spec, n) => {
      if (n === 2)
        throw new BudgetExceededError({ scope: 'day', capCents: 10, committedCents: 10, maxCents: 2 })
    }
  })
  const out = await readMenuPhotos({ ...h.input, photos: [photo(1), photo(2), photo(3)], door: ready })
  assert.equal(out.status, 'budget')
  assert.equal(h.calls.length, 1)
  assert.deepEqual(
    out.items.map((i) => i.name),
    ['Tea']
  )
})

test('a control error (a lost lease) is not swallowed', async () => {
  const h = harness({
    responses: [answer([])],
    chargeImpl: async () => {
      throw Object.assign(new Error('lease'), { code: 'STALE_LEASE' })
    }
  })
  await assert.rejects(readMenuPhotos({ ...h.input, photos: [photo(1)], door: ready }), {
    code: 'STALE_LEASE'
  })
})

test('malformed model JSON is rejected and stores nothing, yet the call is still settled', async () => {
  const h = harness({
    responses: [reply('Sure! Here are the dishes: Hummus 32'), reply('{"items": "none"}')]
  })
  const out = await readMenuPhotos({ ...h.input, photos: [photo(1), photo(2)], door: ready })
  assert.deepEqual(out.items, [])
  assert.deepEqual(
    out.reads.map((r) => [r.status, r.reason]),
    [
      ['failed', 'bad_answer'],
      ['failed', 'bad_answer']
    ]
  )
  assert.equal(h.settled.length, 2)
  assert.ok(h.settled.every((c) => c >= 1))
  assert.equal(
    parseMenuPhotoAnswer('{"items": [{"price": "5"}, {"name": "Tea", "price": "about 5"}]}').items[0].price,
    null
  )
})

test('the per-place limit caps the photos read, and a reading of an unchanged photo is not paid for again', async () => {
  const h = harness({ responses: [answer([{ name: 'Tea', price: '5' }])] })
  const photos = Array.from({ length: 30 }, (_, i) => photo(i + 1))
  const first = await readMenuPhotos({ ...h.input, photos, door: ready })
  assert.equal(h.calls.length, 24)
  assert.equal(first.photos.filter((p) => p.result === 'over-limit').length, 6)
  const again = await readMenuPhotos({ ...h.input, photos, held: first.collected, door: ready })
  assert.equal(h.calls.length, 24)
  assert.equal(again.items.length, first.items.length)
  // A raised limit reads only the photos it adds; a lowered one reads nothing.
  const raised = await readMenuPhotos({ ...h.input, photos, held: first.collected, limit: 27, door: ready })
  assert.equal(h.calls.length, 27)
  await readMenuPhotos({ ...h.input, photos, held: raised.collected, limit: 10, door: ready })
  assert.equal(h.calls.length, 27)
  await readMenuPhotos({ ...h.input, photos, held: first.collected, force: true, door: ready })
  assert.equal(h.calls.length, 27 + 24)
})

test('the country comes from Google address components', () => {
  assert.equal(
    countryOf({ googlePlace: { addressComponents: [{ types: ['country', 'political'], shortText: 'AE' }] } }),
    'AE'
  )
  assert.equal(countryOf({}), null)
})

const found = (extra = {}) => ({
  state: 'ok',
  credential: { apiKey: 'k', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  snapshot: {
    providerId: 'p1',
    providerRevision: 1,
    assignmentRevision: 2,
    assignmentUpdatedAt: '2026-10-23T00:00:00.000Z',
    presetId: 'deepseek',
    effort: null,
    metadata: { vision: true, reasoning: true, reasoningEfforts: ['low', 'high', 'max'] },
    ...extra
  }
})

test('research reads a ready vision assignment without an expiring quality proof', async () => {
  const ready = await menuVisionDoorFor({}, 's', {
    ...woHost,
    lookupDoor: async () => found(),
    currentVisionProof: async () => {
      throw new Error('Research must not ask for a quality proof')
    }
  })
  assert.equal(ready.state, 'ready')
  assert.equal(ready.door.model, 'deepseek-flash')
})

test('a model that is not tested is skipped by the reader: no call, no charge, status not_tested', async () => {
  const h = harness({ responses: [answer([])] })
  const out = await readMenuPhotos({ ...h.input, photos: [photo(1)], door: { state: 'not_tested' } })
  assert.equal(out.status, 'not_tested')
  assert.equal(h.calls.length + h.specs.length, 0)
})

test('reasoning off is an option of the assignment: thinking is disabled in the request, default stays low', async () => {
  assert.equal(menuVisionDoorOf(found(), woHost).door.effort, 'low')
  const off = menuVisionDoorOf(found({ effort: 'off' }), woHost)
  assert.equal(off.door.effort, 'off')
  const h = harness({ responses: [answer([{ name: 'Tea', price: '5' }])] })
  await readMenuPhotos({ ...h.input, photos: [photo(1)], door: off })
  assert.deepEqual(h.calls[0].body.thinking, { type: 'disabled' })
  assert.equal(h.calls[0].body.reasoning_effort, undefined)
  // A provider without a reasoning control sends neither.
  const plain = menuVisionDoorOf(found({ presetId: 'openrouter', effort: 'off' }), woHost)
  assert.equal(plain.door.effort, null)
})

test('changing the model or the effort changes the reading key, so the photos are read and paid for again', async () => {
  const h = harness({ responses: [answer([{ name: 'Tea', price: '5' }])] })
  const first = await readMenuPhotos({ ...h.input, photos: [photo(1)], door: ready })
  await readMenuPhotos({
    ...h.input,
    photos: [photo(1)],
    held: first.collected,
    door: { state: 'ready', door: { ...ready.door, effort: 'off' } }
  })
  assert.equal(h.calls.length, 2)
})

test('one call classifies and reads: a photo the model calls not a menu gives no dishes and is recorded so', async () => {
  assert.match(MENU_PHOTO_SYSTEM, /"isMenu"/)
  const h = harness({
    responses: [
      reply(JSON.stringify({ isMenu: false, items: [{ name: 'Sunset terrace', price: '5' }] })),
      reply(JSON.stringify({ isMenu: true, items: [{ name: 'Tea', price: '5' }] }))
    ]
  })
  const out = await readMenuPhotos({ ...h.input, photos: [photo(1), photo(2)], door: ready })
  assert.deepEqual(
    out.items.map((i) => [i.name, i.source.url]),
    [['Tea', 'https://g.test/p2']]
  )
  assert.deepEqual(
    out.reads.map((r) => [r.url, r.status, r.isMenu, r.items]),
    [
      ['https://g.test/p1', 'complete', false, 0],
      ['https://g.test/p2', 'complete', true, 1]
    ]
  )
  assert.equal(out.reading.notMenu, 1)
  assert.deepEqual(parseMenuPhotoAnswer('{"items": []}'), { isMenu: false, priceScale: null, items: [] })
  assert.equal(parseMenuPhotoAnswer('{"items": [{"name": "Tea"}]}').isMenu, true)
})

test('candidates: Google menu photos, then photos whose words name a menu, then text-heavy photos; uncapped', () => {
  const row = (id, extra = {}) => ({
    id,
    status: 'stored',
    object_key: `k/${id}`,
    revoked_at: null,
    kind: 'image',
    category: 'food',
    source_url: `https://cdn.test/${id}.jpg`,
    ...extra
  })
  const graphic = (features) => Number(features?.top2Share) > 0.68
  const rows = [
    row('plain'),
    row('heavy', { labels: { features: { top2Share: 0.8, edgeDensity: 0.3 } } }),
    row('alt', { alt: 'Our new MENU' }),
    row('file', { source_url: 'https://cdn.test/uploads/thuc-don-2026.jpg' }),
    row('google', { category: 'menu', posted_at: '2026-01-01T00:00:00Z' }),
    row('caption', { caption: 'Weekend carte is out!' }),
    row('video', { kind: 'video', category: 'menu' }),
    row('gone', { category: 'menu', revoked_at: '2026-10-01T00:00:00Z' }),
    row('unstored', { category: 'menu', status: 'failed' })
  ]
  assert.deepEqual(
    menuPhotoCandidates(rows, { graphic }).map((r) => r.id),
    ['google', 'alt', 'file', 'caption', 'heavy']
  )
  assert.deepEqual(
    menuPhotoCandidates(rows).map((r) => r.id),
    ['google', 'alt', 'file', 'caption']
  )
  const many = Array.from({ length: 12 }, (_, i) => row(`m${i}`, { category: 'menu' }))
  assert.equal(menuPhotoCandidates([...many, ...rows], { graphic }).length, 17)
})

test('candidates under 200 px on the short side are skipped unless their words name a menu', () => {
  const row = (id, extra = {}) => ({
    id,
    status: 'stored',
    object_key: `k/${id}`,
    revoked_at: null,
    kind: 'image',
    category: 'other',
    source_url: `https://cdn.test/${id}.png`,
    width: 1200,
    height: 900,
    ...extra
  })
  const graphic = () => true
  const rows = [
    row('icon', { width: 64, height: 64 }),
    row('logo', { width: 640, height: 120 }),
    row('small-menu', { width: 180, height: 240, alt: 'Lunch menu' }),
    row('photo'),
    row('unmeasured', { width: null, height: null })
  ]
  assert.deepEqual(
    menuPhotoCandidates(rows, { graphic }).map((r) => r.id),
    ['small-menu', 'photo', 'unmeasured']
  )
})

// QuillHaus (stand, 24/10/2026): 13 of the 24 reads went to social posts whose long caption mentions a menu in passing
// and to a 1x1 pixel; every one was read "not a menu", while logos and line art waited behind them.
test('candidates: a post that only mentions a menu goes last; pixels and logos are dropped; page-shaped graphics first', () => {
  const row = (id, extra = {}) => ({
    id,
    status: 'stored',
    object_key: `k/${id}`,
    revoked_at: null,
    kind: 'image',
    category: 'other',
    source_url: `https://cdn.test/${id}.png`,
    width: 1080,
    height: 1080,
    labels: { features: { top2Share: 0.3, edgeDensity: 0.3 } },
    ...extra
  })
  const flat = { features: { top2Share: 0.95, edgeDensity: 0.05 } }
  const graphic = (features) => Number(features?.top2Share) > 0.68
  const rows = [
    row('post', {
      source: 'facebook',
      category: 'event',
      width: 1080,
      height: 1440,
      caption:
        'YOUR WEEK, YOUR QUILLHAUS. Swipe left for live music every night, ladies night on Thursday and our new brunch menu on Saturday'
    }),
    row('pixel', {
      source: 'website',
      category: 'food',
      width: 1,
      height: 1,
      caption: 'Quillhaus Al Barari’s curated menu',
      labels: flat
    }),
    row('logo', { width: 500, height: 500, caption: 'Black Logo of Hide0ut 01', labels: flat }),
    row('square', { width: 1080, height: 1080, labels: flat }),
    row('page', { width: 793, height: 1122, labels: flat }),
    row('titled', { caption: 'Our drinks menu' }),
    row('google', { source: 'google-maps', category: 'menu', width: 3024, height: 4032 }),
    row('room'),
    row('story', {
      source: 'instagram',
      width: 1080,
      height: 1440,
      labels: flat,
      posted_at: '2026-10-01T00:00:00Z'
    })
  ]
  assert.deepEqual(
    menuPhotoCandidates(rows, { graphic }).map((r) => r.id),
    ['google', 'titled', 'page', 'story', 'square', 'post'],
    'a portrait post is not page-shaped: that is its format'
  )
})

test('the version names how a photo is read, never how many: model, effort or fingerprint change it, the limit does not', () => {
  const v = menuPhotoVersion(ready.door)
  assert.match(v, /^menu-photos-[0-9a-f]{16}$/)
  assert.equal(menuPhotoVersion({ ...ready.door }), v)
  assert.notEqual(menuPhotoVersion({ ...ready.door, effort: 'off' }), v)
  assert.notEqual(menuPhotoVersion({ ...ready.door, model: 'other' }), v)
  assert.notEqual(
    menuPhotoVersion({ ...ready.door, fingerprint: 'f1' }),
    menuPhotoVersion({ ...ready.door, fingerprint: 'f2' })
  )
})

test('scope: exact duplicate bytes are never sent, the limit cuts the rest, held readings are skipped', () => {
  const version = menuPhotoVersion(ready.door)
  const candidates = [photo(1), photo(2), photo(3, { sha256: 'sha1' }), photo(4), photo(5)]
  const held = [
    { sha256: 'sha2', read: 'menu', version },
    { sha256: 'sha4', read: 'not-menu', version: 'menu-photos-old' }
  ]
  const s = menuPhotoScope({ candidates, limit: 3, held, version, now: AT })
  assert.deepEqual(
    s.selected.map((p) => p.id),
    ['m1', 'm2', 'm4']
  )
  assert.deepEqual(
    s.dups.map((d) => [d.photo.id, d.of.id]),
    [['m3', 'm1']]
  )
  assert.deepEqual(
    s.over.map((p) => p.id),
    ['m5']
  )
  // m2 holds a reading under this version; m4's is an older rule's, so it is read again.
  assert.deepEqual(
    s.toRead.map((p) => p.id),
    ['m1', 'm4']
  )
  assert.deepEqual(menuPhotoScope({ candidates, limit: 0, held, version, now: AT }).toRead, [])
  assert.deepEqual(
    menuPhotoScope({ candidates, limit: 3, held, version, now: AT, only: ['sha4'] }).toRead.map((p) => p.id),
    ['m4']
  )
})

// Lee (24/10/2026): QuillHaus read 13 guesses past Google's menu photos, none a menu. Past the photos a source labels as a
// menu, reading stops after NOT_MENU_STREAK_STOP readings in a row that are not menus; only a menu reading resets it.
const labeledPhoto = (n) => photo(n, { category: 'menu' })
const guesses = (from, count) => Array.from({ length: count }, (_, i) => photo(from + i))

test('scope: past the labeled photos, reading stops after 4 guesses in a row that are not menus', () => {
  const version = menuPhotoVersion(ready.door)
  const candidates = [labeledPhoto(1), labeledPhoto(2), ...guesses(3, 8)]
  // Nothing read yet: the labeled photos, then 4 guesses (each could be "not a menu"); the rest stop early.
  const first = menuPhotoScope({ candidates, limit: 24, version, now: AT })
  assert.deepEqual(
    first.toRead.map((p) => p.id),
    ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
  )
  assert.deepEqual(
    first.stopped.map((p) => p.id),
    ['m7', 'm8', 'm9', 'm10']
  )
  // Four guesses read, none a menu: an automatic run reads nothing more.
  const fourNot = ['sha3', 'sha4', 'sha5', 'sha6'].map((sha256) => ({ sha256, read: 'not-menu', version }))
  const held = [
    { sha256: 'sha1', read: 'menu', version },
    { sha256: 'sha2', read: 'menu', version },
    ...fourNot
  ]
  const after = menuPhotoScope({ candidates, limit: 24, held, version, now: AT })
  assert.deepEqual(after.toRead, [])
  assert.deepEqual(
    after.stopped.map((p) => p.id),
    ['m7', 'm8', 'm9', 'm10']
  )
  // Within the limit only: the limit still cuts first.
  const capped = menuPhotoScope({ candidates, limit: 4, version, now: AT })
  assert.deepEqual([capped.toRead.length, capped.stopped.length, capped.over.length], [4, 0, 6])
})

test('scope: the labeled photos are never cut short, however many are not menus', () => {
  const version = menuPhotoVersion(ready.door)
  const labeled = Array.from({ length: 9 }, (_, i) => labeledPhoto(i + 1))
  const held = labeled.slice(0, 6).map((p) => ({ sha256: p.sha256, read: 'not-menu', version }))
  const s = menuPhotoScope({ candidates: [...labeled, ...guesses(10, 3)], limit: 24, held, version, now: AT })
  assert.deepEqual(
    s.toRead.map((p) => p.id),
    ['m7', 'm8', 'm9', 'm10', 'm11', 'm12']
  )
  assert.deepEqual(s.stopped, [])
})

test('scope: only a menu reading resets the streak; unreadable and same-menu neither count nor reset', () => {
  const version = menuPhotoVersion(ready.door)
  const candidates = guesses(1, 10)
  const read = (n, r) => ({ sha256: `sha${n}`, read: r, version })
  // not, not, menu, not, unreadable, not: the streak is 2 after the menu (m4, m6), so 2 more guesses may be read.
  const held = [
    read(1, 'not-menu'),
    read(2, 'not-menu'),
    read(3, 'menu'),
    read(4, 'not-menu'),
    read(5, 'unreadable'),
    read(6, 'not-menu')
  ]
  const s = menuPhotoScope({ candidates, limit: 24, held, version, now: AT })
  assert.deepEqual(
    s.toRead.map((p) => p.id),
    ['m7', 'm8']
  )
  assert.deepEqual(
    s.stopped.map((p) => p.id),
    ['m9', 'm10']
  )
})

test('scope: a person pressing the button reads the next 4 past the stop, within the limit and the frozen list', () => {
  const version = menuPhotoVersion(ready.door)
  const candidates = [labeledPhoto(1), ...guesses(2, 10)]
  const held = [
    { sha256: 'sha1', read: 'menu', version },
    ...[2, 3, 4, 5].map((n) => ({ sha256: `sha${n}`, read: 'not-menu', version }))
  ]
  const auto = menuPhotoScope({ candidates, limit: 24, held, version, now: AT })
  assert.deepEqual(auto.toRead, [])
  const pressed = menuPhotoScope({ candidates, limit: 24, held, version, now: AT, manual: true })
  assert.deepEqual(
    pressed.toRead.map((p) => p.id),
    ['m6', 'm7', 'm8', 'm9']
  )
  assert.deepEqual(
    pressed.stopped.map((p) => p.id),
    ['m10', 'm11']
  )
  const frozen = menuPhotoScope({
    candidates,
    limit: 24,
    held,
    version,
    now: AT,
    manual: true,
    only: ['sha7']
  })
  assert.deepEqual(
    frozen.toRead.map((p) => p.id),
    ['m7']
  )
  assert.deepEqual(
    menuPhotoScope({ candidates, limit: 7, held, version, now: AT, manual: true }).toRead.map((p) => p.id),
    ['m6', 'm7']
  )
})

test('photos past the stop are recorded stopped-early, not over the limit, and are not read', async () => {
  const h = harness({ responses: [reply(JSON.stringify({ isMenu: false, items: [] }))] })
  const out = await readMenuPhotos({
    ...h.input,
    photos: [labeledPhoto(1), ...guesses(2, 6)],
    door: ready,
    limit: 6
  })
  assert.equal(h.calls.length, 5, 'the labeled photo and 4 guesses')
  assert.deepEqual(
    out.photos.map((p) => [p.mediaId, p.result]),
    [
      ['m1', 'not-menu'],
      ['m2', 'not-menu'],
      ['m3', 'not-menu'],
      ['m4', 'not-menu'],
      ['m5', 'not-menu'],
      ['m6', 'stopped-early'],
      ['m7', 'over-limit']
    ]
  )
  assert.equal(out.reading.stopped, 1)
})

test('a menu among the guesses resets the streak as the run reads, so the run reads on', async () => {
  const not = reply(JSON.stringify({ isMenu: false, items: [] }))
  const menu = answer([{ name: 'Tea', price: '5' }])
  // not, not, not, menu, not, not, not, not | stop
  const h = harness({ responses: [not, not, not, menu, not, not, not, not, not] })
  const out = await readMenuPhotos({ ...h.input, photos: guesses(1, 10), door: ready })
  assert.equal(h.calls.length, 8)
  assert.deepEqual(
    out.photos.slice(7).map((p) => p.result),
    ['not-menu', 'stopped-early', 'stopped-early']
  )
  assert.equal(out.status, 'complete', 'a stop is a decision, not an unfinished run')
})

test('a person pressing the button reads the next batch past an earlier stop; an automatic run does not', async () => {
  const not = reply(JSON.stringify({ isMenu: false, items: [] }))
  const h = harness({ responses: [not] })
  const photos = guesses(1, 10)
  const first = await readMenuPhotos({ ...h.input, photos, door: ready })
  assert.equal(h.calls.length, 4)
  await readMenuPhotos({ ...h.input, photos, held: first.collected, door: ready })
  assert.equal(h.calls.length, 4, 'automatic: the stop holds')
  const pressed = await readMenuPhotos({
    ...h.input,
    photos,
    held: first.collected,
    door: ready,
    manual: true
  })
  assert.equal(h.calls.length, 8)
  assert.deepEqual(pressed.photos.map((p) => p.result).filter((r) => r === 'stopped-early').length, 2)
})

test('scope: a failed try waits a day unless a person pressed the button', () => {
  const version = menuPhotoVersion(ready.door)
  const held = [{ sha256: 'sha1', read: 'failed', version, at: new Date(AT - 3600_000).toISOString() }]
  assert.deepEqual(menuPhotoScope({ candidates: [photo(1)], limit: 5, held, version, now: AT }).toRead, [])
  assert.equal(
    menuPhotoScope({ candidates: [photo(1)], limit: 5, held, version, now: AT, manual: true }).toRead.length,
    1
  )
  assert.equal(
    menuPhotoScope({ candidates: [photo(1)], limit: 5, held, version, now: AT + 2 * 86_400_000 }).toRead
      .length,
    1
  )
})

test('a photo under a new URL with the same bytes keeps its reading: the key is the content hash', async () => {
  const h = harness({ responses: [answer([{ name: 'Tea', price: '5' }])] })
  const first = await readMenuPhotos({ ...h.input, photos: [photo(1)], door: ready })
  const moved = await readMenuPhotos({
    ...h.input,
    photos: [photo(1, { source_url: 'https://cdn.test/new-url.jpg', id: 'm9' })],
    held: first.collected,
    door: ready
  })
  assert.equal(h.calls.length, 1)
  assert.deepEqual(
    moved.items.map((i) => i.name),
    ['Tea']
  )
  assert.equal(moved.photos[0].mediaId, 'm9')
  // Same URL, new bytes: read again.
  await readMenuPhotos({
    ...h.input,
    photos: [photo(1, { sha256: 'new' })],
    held: first.collected,
    door: ready
  })
  assert.equal(h.calls.length, 2)
})

test('each photo records its result, dishes, cost and model; same bytes and near-same dishes say "same menu"', async () => {
  const dishes = [
    { name: 'Tea', price: '5' },
    { name: 'Coffee', price: '7' },
    { name: 'Juice', price: '9' },
    { name: 'Water', price: '2' },
    { name: 'Soda', price: '4' }
  ]
  const h = harness({
    responses: [
      answer(dishes),
      reply(JSON.stringify({ isMenu: false, items: [] })),
      answer(dishes.slice(0, 4)),
      reply(JSON.stringify({ isMenu: true, items: [] }))
    ]
  })
  const out = await readMenuPhotos({
    ...h.input,
    photos: [photo(1), photo(2), photo(3), photo(4), photo(5, { sha256: 'sha1' })],
    door: ready
  })
  assert.deepEqual(
    out.photos.map((p) => [p.mediaId, p.result, p.items, p.sameAs]),
    [
      ['m1', 'menu', 5, null],
      ['m2', 'not-menu', 0, null],
      ['m3', 'same-menu', 4, 'm1'],
      ['m4', 'unreadable', 0, null],
      ['m5', 'same-menu', 0, 'm1']
    ]
  )
  assert.equal(h.calls.length, 4, 'the duplicate bytes are not sent')
  const cost = visionCostCents('deepseek-flash', { promptTokens: 1000, completionTokens: 4000 })
  assert.equal(out.photos[0].costCents, cost)
  assert.equal(out.photos[0].model, 'deepseek-flash')
  assert.equal(out.collected.limit, MENU_PHOTOS_PER_PLACE)
  assert.equal(out.items[0].source.mediaId, 'm1')
})
