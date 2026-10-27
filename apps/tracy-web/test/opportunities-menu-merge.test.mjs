import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dishKey, mergeMenuItems } from 'website-opportunities/src/menu-items.js'

const web = (name, price, extra = {}) => ({
  name,
  price,
  currency: null,
  section: null,
  source: { url: 'https://r.test/menu', kind: 'page' },
  verified: true,
  ...extra
})
const photo = (name, price, url, postedAt = null) => ({
  name,
  price,
  currency: null,
  section: null,
  source: { url, kind: 'photo', ...(postedAt ? { postedAt } : {}) },
  verified: false
})

test('a dish is matched across sources by case, accents, punctuation and simple plurals', () => {
  assert.equal(dishKey('Crème Brûlée'), dishKey('creme brulee'))
  assert.equal(dishKey('Fish & Chips (D)(G)'), dishKey('fish and chips'))
  assert.equal(dishKey('Falafel Wraps'), dishKey('falafel wrap'))
  assert.equal(dishKey('Tomatoes'), dishKey('tomato'))
  assert.notEqual(dishKey('Hummus'), dishKey('Houmous'))
})

test('the website beats a photo: same dish keeps the website name and price, the photo reading is dropped', () => {
  const out = mergeMenuItems([web('Hummus', '32'), photo('HUMMUS', '28', 'https://p/1')])
  assert.deepEqual(
    out.map((i) => [i.name, i.price, i.verified]),
    [['Hummus', '32', true]]
  )
})

test('a dish only a photo shows is added beside the website list, unverified', () => {
  const out = mergeMenuItems([web('Hummus', '32'), photo('Shakshuka', '45', 'https://p/1')])
  assert.deepEqual(
    out.map((i) => [i.name, i.price, i.verified]),
    [
      ['Hummus', '32', true],
      ['Shakshuka', '45', false]
    ]
  )
})

test('a search-result link ranks under the website and over a photo', () => {
  const searched = new Set(['https://other.test/menu'])
  const found = {
    ...web('Hummus', '30', { verified: false }),
    source: { url: 'https://other.test/menu', kind: 'page' }
  }
  const out = mergeMenuItems([photo('Hummus', '25', 'https://p/1'), found, web('Hummus', '32')], { searched })
  assert.deepEqual(
    out.map((i) => i.price),
    ['32']
  )
  const noSite = mergeMenuItems([photo('Hummus', '25', 'https://p/1'), found], { searched })
  assert.deepEqual(
    noSite.map((i) => i.price),
    ['30']
  )
})

test('several photos give a price: the newest photo wins when dates are known', () => {
  const out = mergeMenuItems([
    photo('Burger', '50', 'https://p/old', '2024-03-01T00:00:00Z'),
    photo('Burger', '58', 'https://p/new', '2026-09-01T00:00:00Z')
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].price, '58')
  assert.equal(out[0].source.url, 'https://p/new')
  assert.equal(out[0].verified, false)
})

test('unknown or equal dates and different prices: no price, flagged, never picked silently', () => {
  for (const dates of [
    [null, null],
    ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
    ['2026-01-01T00:00:00Z', null]
  ]) {
    const out = mergeMenuItems([
      photo('Burger', '50', 'https://p/a', dates[0]),
      photo('Burger', '58', 'https://p/b', dates[1])
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].price, null)
    assert.equal(out[0].priceConflict, true)
    assert.equal(out[0].priceNote, 'prices differ between sources')
    assert.equal(out[0].verified, false)
  }
})

test('the same price on two photos, or a price on only one, is kept as it is', () => {
  assert.equal(
    mergeMenuItems([photo('Tea', '12', 'https://p/a'), photo('Tea', '12.00', 'https://p/b')])[0].price,
    '12'
  )
  const one = mergeMenuItems([photo('Tea', null, 'https://p/a'), photo('Tea', '12', 'https://p/b')])
  assert.deepEqual(
    one.map((i) => i.price),
    ['12']
  )
  assert.equal(one[0].priceConflict, undefined)
})

test('sizes of one dish stay separate rows among photos', () => {
  const small = { ...photo('Latte', '15', 'https://p/a'), size: 'small' }
  const large = { ...photo('Latte', '19', 'https://p/a'), size: 'large' }
  assert.deepEqual(
    mergeMenuItems([small, large]).map((i) => i.price),
    ['15', '19']
  )
})

test('menuFieldsOf: no photo step leaves the link readings untouched; a photo step adds its status and reading', async () => {
  const { menuFieldsOf } = await import('website-opportunities/src/menu-items.js')
  const docs = {
    menuItems: [web('Hummus', '32')],
    menuReads: [{ url: 'https://r.test/menu', kind: 'page', status: 'complete', items: 1 }]
  }
  assert.equal(menuFieldsOf({ docs, photos: null }), docs)
  const photos = {
    status: 'complete',
    items: [photo('Hummus', '20', 'https://p/1'), photo('Shakshuka', '45', 'https://p/1')],
    reads: [{ url: 'https://p/1', kind: 'photo', status: 'complete', items: 2 }],
    reading: { model: 'deepseek-flash' }
  }
  const out = menuFieldsOf({ docs, photos })
  assert.deepEqual(
    out.menuItems.map((i) => [i.name, i.price, i.verified]),
    [
      ['Hummus', '32', true],
      ['Shakshuka', '45', false]
    ]
  )
  assert.equal(out.menuReads.length, 2)
  assert.equal(out.menuPhotoStatus, 'complete')
  const none = menuFieldsOf({
    docs: {},
    photos: { status: 'not_configured', items: [], reads: [], reading: null }
  })
  assert.deepEqual(none, { menuPhotoStatus: 'not_configured' })
})

test('the highest-ranked source speaks: a photo price never overrides a search-result price for the same dish', () => {
  const searched = new Set(['https://other.test/menu'])
  const found = {
    ...web('Falafel', '20', { verified: false }),
    source: { url: 'https://other.test/menu', kind: 'page' }
  }
  const out = mergeMenuItems([photo('Falafel', '18', 'https://p/1', '2026-10-01T00:00:00Z'), found], {
    searched
  })
  assert.deepEqual(
    out.map((i) => [i.name, i.price, i.verified, i.priceConflict ?? false]),
    [['Falafel', '20', false, false]]
  )
})

test('two sources of the same rank with different prices: one dish, no price, flagged', () => {
  const pdf = { ...web('Hummus', '34'), source: { url: 'https://r.test/menu.pdf', kind: 'pdf', page: 1 } }
  const out = mergeMenuItems([web('Hummus', '32'), pdf])
  assert.equal(out.length, 1)
  assert.equal(out[0].name, 'Hummus')
  assert.equal(out[0].price, null)
  assert.equal(out[0].priceConflict, true)
  assert.equal(out[0].verified, false)
  const searched = new Set(['https://a.test/m', 'https://b.test/m'])
  const a = { ...web('Hummus', '30', { verified: false }), source: { url: 'https://a.test/m', kind: 'page' } }
  const b = { ...web('Hummus', '31', { verified: false }), source: { url: 'https://b.test/m', kind: 'page' } }
  const both = mergeMenuItems([a, b], { searched })
  assert.deepEqual(
    both.map((i) => [i.price, i.priceConflict]),
    [[null, true]]
  )
})

test('the same dish twice on the website at one price is one row; a dish under two printed sections stays two', () => {
  const pdf = { ...web('Hummus', '32.00'), source: { url: 'https://r.test/menu.pdf', kind: 'pdf', page: 1 } }
  assert.deepEqual(
    mergeMenuItems([web('Hummus', '32'), pdf]).map((i) => [i.price, i.verified]),
    [['32', true]]
  )
  const lunch = web('Burger', '10', { section: 'Lunch' })
  const dinner = web('Burger', '14', { section: 'Dinner' })
  assert.deepEqual(
    mergeMenuItems([lunch, dinner]).map((i) => [i.section, i.price]),
    [
      ['Lunch', '10'],
      ['Dinner', '14']
    ]
  )
})

test('a dish with no price is still a dish', () => {
  const out = mergeMenuItems([photo('Mint lemonade', null, 'https://p/1')])
  assert.deepEqual(
    out.map((i) => [i.name, i.price]),
    [['Mint lemonade', null]]
  )
})

test('dishes keep the order of their sections as on the menu', () => {
  const out = mergeMenuItems([
    web('Kofta', '40', { section: 'Mains' }),
    web('Hummus', '32', { section: 'Starters' }),
    web('Shawarma', '45', { section: 'Mains' }),
    web('Baklava', '20', { section: 'Desserts' })
  ])
  assert.deepEqual(
    out.map((i) => i.name),
    ['Kofta', 'Shawarma', 'Hummus', 'Baklava']
  )
})

test('menuSummary: dishes, sections, price range per currency, source kinds, no-price count and dated photos', async () => {
  const { menuSummary } = await import('website-opportunities/src/menu-items.js')
  const items = [
    web('Hummus', '12', { currency: 'AED', section: 'Starters' }),
    web('Kofta', '95', { currency: 'AED', section: 'Mains' }),
    {
      ...photo('Iftar platter', '38', 'https://p/1', '2024-03-01T00:00:00Z'),
      currency: 'AED',
      section: 'Ramadan specials'
    },
    { ...photo('Tea', '5', 'https://p/2', '2026-09-01T00:00:00Z'), currency: 'USD', section: 'Drinks' },
    { ...photo('Mint lemonade', null, 'https://p/2', '2026-09-01T00:00:00Z'), section: 'Drinks' },
    { ...photo('Falafel', null, 'https://p/3'), priceConflict: true }
  ]
  const s = menuSummary(items, { at: '2026-10-23T00:00:00Z' })
  assert.match(s, /^6 dishes in 5 sections: Starters, Mains, Ramadan specials, Drinks, \(no section\)\./)
  assert.match(s, /Prices: AED 12–95 \(3 dishes\); USD 5 \(1 dish\)\./)
  assert.match(s, /2 dishes have no price \(1 because sources disagree\)\./)
  assert.match(s, /Sources: website 2, photo 4\./)
  assert.match(s, /Seasonal sections: Ramadan specials\./)
  assert.match(s, /Photos dated 2024-03-01 to 2026-09-01; the oldest is over a year old\./)
  assert.match(menuSummary([], {}), /^No menu was collected/)
  const wide = Array.from({ length: 15 }, (_, n) => web(`Dish ${n}`, '1', { section: `S${n}` }))
  assert.match(menuSummary(wide), /^15 dishes in 15 sections: S0, S1, .*S11 and 3 more\./)
})

test('one source printing two prices for a dish (25ml and 50ml unlabelled) keeps both rows; only different sources conflict', () => {
  const pdf = (price) => ({
    ...web('Baileys', price, { size: '25ml 50ml' }),
    source: { url: 'https://r.test/spirits.pdf', kind: 'pdf', page: 1 }
  })
  assert.deepEqual(
    mergeMenuItems([pdf('48'), pdf('94')]).map((i) => [i.price, i.verified, i.priceConflict ?? false]),
    [
      ['48', true, false],
      ['94', true, false]
    ]
  )
  const same = mergeMenuItems([photo('Tea', '5', 'https://p/1'), photo('Tea', '8', 'https://p/1')])
  assert.deepEqual(
    same.map((i) => i.price),
    ['5', '8']
  )
})

test('readings with no source url are never taken for one source', () => {
  const bare = (price) => ({ ...photo('Tea', price, 'x'), source: { kind: 'photo' } })
  const out = mergeMenuItems([bare('5'), bare('8')])
  assert.deepEqual(
    out.map((i) => [i.price, i.priceConflict]),
    [[null, true]]
  )
})

// Tin Lantern Saigon (stand, 24/10/2026): "110" is printed for 110,000 VND (`priceScale: 1000`, Lee: never multiplied).
test('a price printed in thousands is compared as its amount, kept as printed, and its scale travels with it', async () => {
  const k = (name, price, url, extra = {}) => ({
    ...photo(name, price, url),
    currency: 'VND',
    priceScale: 1000,
    ...extra
  })
  // "110" in thousands and "110.000" in full are one price: no conflict.
  const same = mergeMenuItems([
    k('Mojito', '110', 'https://p/1'),
    { ...photo('Mojito', '110.000', 'https://p/2'), currency: 'VND' }
  ])
  assert.equal(same.length, 1)
  assert.equal(same[0].priceConflict, undefined)
  // "120" in thousands and "120" in full are not: flagged, both kept beside it with their scale.
  const differ = mergeMenuItems([
    k('Negroni', '220', 'https://p/1'),
    { ...photo('Negroni', '220', 'https://p/2'), currency: 'VND' }
  ])
  assert.equal(differ[0].priceConflict, true)
  assert.deepEqual(
    differ[0].otherPrices.map((o) => [o.price, o.priceScale ?? null]),
    [
      ['220', 1000],
      ['220', null]
    ]
  )
  // Glass and bottle of one drink stay two rows, each its size, never multiplied.
  const sized = mergeMenuItems([
    k('CAPTAIN MORGAN GOLD', '110', 'https://p/1', { size: '50ML' }),
    k('CAPTAIN MORGAN GOLD', '1485', 'https://p/1', { size: '750ML' })
  ])
  assert.deepEqual(
    sized.map((i) => [i.size, i.price, i.priceScale]),
    [
      ['50ML', '110', 1000],
      ['750ML', '1485', 1000]
    ]
  )
  const { menuSummary } = await import('website-opportunities/src/menu-items.js')
  assert.match(
    menuSummary(sized),
    /Prices: VND 110–1485, printed in thousands \(110 means 110,000\) \(2 dishes\)\./
  )
  const won = [{ ...photo('Bibimbap', '1.2', 'https://p/3'), currency: 'KRW', priceScale: 10000 }]
  assert.match(menuSummary(won), /KRW 1\.2, printed in ten-thousands \(1\.2 means 12,000\)/)
  const usd = [
    { ...photo('Latte', '4.50', 'https://p/4'), currency: 'USD', priceScale: 1 },
    { ...photo('Tea', '3', 'https://p/4'), currency: 'USD', priceScale: null }
  ]
  assert.match(menuSummary(usd), /Prices: USD 3–4\.5 \(2 dishes\)\./)
})
