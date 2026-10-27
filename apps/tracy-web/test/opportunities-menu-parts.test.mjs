// The Menu field (tasks/todo-wo-menu-items.md): two tracked research parts, `menu-file` and `menu-photos`, one merged
// list of dishes, the place view's `menu` object, and the Research again plan of a food place.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MENU_FILE_VERSION,
  menuApplicable,
  menuEmptyNote,
  menuSummary,
  mergeMenuItems
} from 'website-opportunities/src/menu-items.js'
import { menuPhotoCeilingCents } from 'website-opportunities/src/menu-photo-reading.js'
import { menuViewOf } from 'website-opportunities/src/place-view.js'
import { againPartsOf, againShape, researchAgainPlan } from 'website-opportunities/src/research-again.js'
import { SHOWN_SOURCES } from 'website-opportunities/src/sources.js'
import { menuRendererOrder, normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'

const AT = '2026-10-24T05:00:00.000Z'
const photoDish = (name, price, mediaId, extra = {}) => ({
  name,
  price,
  currency: price ? 'AED' : null,
  section: null,
  source: {
    kind: 'photo',
    url: `https://g.test/${mediaId}`,
    sha256: `sha-${mediaId}`,
    region: mediaId,
    mediaId
  },
  verified: false,
  ...extra
})
const fileDish = (name, price, extra = {}) => ({
  name,
  price,
  currency: price ? 'AED' : null,
  section: 'Mains',
  source: { kind: 'pdf', url: 'https://r.test/menu.pdf' },
  verified: true,
  ...extra
})

test('the two menu parts are rows of the research card and Try again parts', () => {
  assert.ok(SHOWN_SOURCES.includes('menu-file'))
  assert.ok(SHOWN_SOURCES.includes('menu-photos'))
  assert.match(MENU_FILE_VERSION, /^menu-file-/)
})

test('menu photos read per place: default 24, 0..60 or the default (as every count setting), 0 switches it off', () => {
  assert.equal(normalizeWoOpsSettings({}).menuPhotosPerPlace, 24)
  assert.equal(normalizeWoOpsSettings({ menuPhotosPerPlace: 0 }).menuPhotosPerPlace, 0)
  assert.equal(normalizeWoOpsSettings({ menuPhotosPerPlace: 30 }).menuPhotosPerPlace, 30)
  assert.equal(normalizeWoOpsSettings({ menuPhotosPerPlace: 60 }).menuPhotosPerPlace, 60)
  assert.equal(normalizeWoOpsSettings({ menuPhotosPerPlace: 99 }).menuPhotosPerPlace, 24)
  assert.equal(normalizeWoOpsSettings({ menuPhotosPerPlace: -3 }).menuPhotosPerPlace, 24)
  assert.equal(normalizeWoOpsSettings({ menuPhotosPerPlace: 'x' }).menuPhotosPerPlace, 24)
})

test('photos disagreeing on a price keep every printed price in otherPrices, with the photo it came from', () => {
  const [burger] = mergeMenuItems([photoDish('Burger', '50', 'm1'), photoDish('Burger', '58', 'm2')])
  assert.equal(burger.price, null, 'never picked silently')
  assert.equal(burger.priceConflict, true)
  assert.deepEqual(burger.otherPrices, [
    { price: '50', mediaId: 'm1' },
    { price: '58', mediaId: 'm2' }
  ])
  // The newest dated photo speaks; the older price stays beside it.
  const [dated] = mergeMenuItems([
    photoDish('Burger', '50', 'm1', {
      source: { ...photoDish('', '', 'm1').source, postedAt: '2024-01-01' }
    }),
    photoDish('Burger', '58', 'm2', { source: { ...photoDish('', '', 'm2').source, postedAt: '2026-09-01' } })
  ])
  assert.equal(dated.price, '58')
  assert.deepEqual(dated.otherPrices, [{ price: '50', mediaId: 'm1' }])
  // The same dish, size, price and currency on three photos is one dish with no other price.
  const same = mergeMenuItems(['m1', 'm2', 'm3'].map((m) => photoDish('Tea', '5', m)))
  assert.equal(same.length, 1)
  assert.equal(same[0].otherPrices, undefined)
})

test('file dishes come first and win over the same dish read off a photo', () => {
  const out = mergeMenuItems([
    photoDish('Hummus', '28', 'm1'),
    fileDish('Hummus', '32'),
    photoDish('Tea', '5', 'm1')
  ])
  assert.deepEqual(
    out.map((i) => [i.name, i.price, i.source.kind]),
    [
      ['Hummus', '32', 'pdf'],
      ['Tea', '5', 'photo']
    ]
  )
})

test('only a food or drink place has a menu, unless real dishes were already collected', () => {
  assert.equal(menuApplicable({ google: { primaryType: 'italian_restaurant' } }), true)
  assert.equal(menuApplicable({ google: { types: ['point_of_interest', 'bar'] } }), true)
  assert.equal(menuApplicable({ google: { primaryType: 'dentist' } }), false)
  assert.equal(menuApplicable({ profile: { businessType: 'Restaurant' } }), true)
  assert.equal(
    menuApplicable({ google: { amenities: { servesDinner: true } } }),
    true,
    'Google only says what a food place serves'
  )
  assert.equal(
    menuApplicable({ profile: { menus: [{ url: 'https://r.test/menu' }] } }),
    true,
    'it links a menu'
  )
  assert.equal(menuApplicable({ menuPhotos: 1 }), true, 'Google lists menu photos for food places only')
  assert.equal(menuApplicable({ google: { primaryType: 'hotel' } }), false)
  assert.equal(menuApplicable({ google: { primaryType: 'hotel' }, items: [fileDish('Soup', '20')] }), true)
  assert.equal(menuApplicable({}), false)
})

test('an empty menu tells the build agent why, so it never invents dishes as if they were read', () => {
  assert.match(menuEmptyNote({ menuPhotoStatus: 'switched_off' }), /photo reading is off on this site/)
  assert.match(menuEmptyNote({ menuPhotoStatus: 'not_configured' }), /photo reading is off on this site/)
  assert.match(menuEmptyNote({ menuPhotoStatus: 'not_tested' }), /not passed its test/)
  assert.match(menuEmptyNote({ menus: [{ url: 'https://r.test/menu' }] }), /held no dishes/)
  assert.match(menuEmptyNote({}), /No menu link or menu photo was found/)
  assert.match(
    menuSummary([], { empty: menuEmptyNote({ menuPhotoStatus: 'switched_off' }) }),
    /photo reading is off/
  )
  assert.match(menuSummary([], {}), /^No menu was collected/)
})

const fileRow = (extra = {}) => ({
  source: 'menu-file',
  status: 'complete',
  collected_at: '2026-10-24T04:00:00.000Z',
  attempted_at: '2026-10-24T04:00:00.000Z',
  collector_version: MENU_FILE_VERSION,
  collected: {
    menus: ['https://r.test/menu.pdf'],
    items: [fileDish('Hummus', '32')],
    reads: [{ url: 'https://r.test/menu.pdf', kind: 'pdf', status: 'complete', items: 1 }]
  },
  ...extra
})
const photosRow = (extra = {}) => ({
  source: 'menu-photos',
  status: 'complete',
  collected_at: AT,
  attempted_at: AT,
  collector_version: 'menu-photos-abc',
  collected: {
    limit: 24,
    reading: { status: 'complete' },
    photos: [
      { mediaId: 'm1', read: 'menu', result: 'menu', items: 2, sameAs: null, costCents: 1, model: 'flash' },
      {
        mediaId: 'm2',
        read: 'not-menu',
        result: 'not-menu',
        items: 0,
        sameAs: null,
        costCents: 1,
        model: 'flash'
      },
      { mediaId: 'm3', read: 'duplicate', result: 'same-menu', items: 0, sameAs: 'm1' },
      { mediaId: 'm4', read: 'unread', result: 'over-limit', items: 0, sameAs: null }
    ]
  },
  ...extra
})

test('the place view holds the Menu exactly as the contract says', () => {
  const profile = {
    googlePlace: { primaryType: 'restaurant' },
    menuItems: mergeMenuItems([
      fileDish('Hummus', '32'),
      photoDish('Tea', '5', 'm1', { currencyAssumed: true }),
      photoDish('Burger', '50', 'm1'),
      photoDish('Burger', '58', 'm5')
    ])
  }
  const menu = menuViewOf({ file: fileRow(), photos: photosRow(), profile })
  assert.deepEqual(Object.keys(menu), [
    'applicable',
    'state',
    'reason',
    'readAt',
    'currency',
    'counts',
    'items',
    'files',
    'photos'
  ])
  assert.equal(menu.applicable, true)
  assert.equal(menu.state, 'read')
  assert.equal(menu.reason, null)
  assert.equal(menu.readAt, AT)
  assert.equal(menu.currency, 'AED')
  assert.deepEqual(menu.counts, { file: 1, photo: 2, photosRead: 2, photosTotal: 4, limit: 24 })
  assert.deepEqual(menu.items[0], {
    name: 'Hummus',
    price: '32',
    currency: 'AED',
    currencyAssumed: false,
    section: 'Mains',
    size: null,
    source: { kind: 'file', url: 'https://r.test/menu.pdf', mediaId: null },
    verified: false,
    priceScale: null,
    otherPrices: []
  })
  assert.deepEqual(menu.items[1].source, { kind: 'photo', url: 'https://g.test/m1', mediaId: 'm1' })
  assert.equal(menu.items[1].currencyAssumed, true)
  const burger = menu.items.find((i) => i.name === 'Burger')
  assert.equal(burger.price, null)
  assert.deepEqual(burger.otherPrices, [
    { price: '50', mediaId: 'm1', priceScale: null },
    { price: '58', mediaId: 'm5', priceScale: null }
  ])
  assert.deepEqual(menu.files, [
    { url: 'https://r.test/menu.pdf', name: 'menu.pdf', items: 1, readAt: '2026-10-24T04:00:00.000Z' }
  ])
  assert.deepEqual(menu.photos, [
    { mediaId: 'm1', result: 'menu', items: 2, sameAs: null },
    { mediaId: 'm2', result: 'not-menu', items: 0, sameAs: null },
    { mediaId: 'm3', result: 'same-menu', items: 0, sameAs: 'm1' },
    { mediaId: 'm4', result: 'over-limit', items: 0, sameAs: null }
  ])
  // /ops also sees what each photo cost and which model read it.
  const ops = menuViewOf({ file: fileRow(), photos: photosRow(), profile, ops: true })
  assert.deepEqual(ops.photos[0], {
    mediaId: 'm1',
    result: 'menu',
    items: 2,
    sameAs: null,
    costCents: 1,
    model: 'flash'
  })
})

// Tin Lantern Saigon (stand, 24/10/2026): the printed number and its scale reach the client; display decides "110k".
test('the place view carries a price printed in thousands as printed, with priceScale 1000', () => {
  const vnd = (name, price, mediaId) => photoDish(name, price, mediaId, { currency: 'VND', priceScale: 1000 })
  const profile = {
    googlePlace: { primaryType: 'bar' },
    menuItems: mergeMenuItems([
      vnd('Mojito', '110', 'm1'),
      vnd('Negroni', '220', 'm1'),
      { ...photoDish('Negroni', '250', 'm5'), currency: 'VND' }
    ])
  }
  const menu = menuViewOf({ file: null, photos: photosRow(), profile })
  const mojito = menu.items.find((i) => i.name === 'Mojito')
  assert.deepEqual([mojito.price, mojito.currency, mojito.priceScale], ['110', 'VND', 1000])
  const negroni = menu.items.find((i) => i.name === 'Negroni')
  assert.deepEqual([negroni.price, negroni.priceScale], [null, null])
  assert.deepEqual(negroni.otherPrices, [
    { price: '220', mediaId: 'm1', priceScale: 1000 },
    { price: '250', mediaId: 'm5', priceScale: null }
  ])
  // Any currency: full amounts stay 1, an unknown or invalid scale is null, ten-thousands and millions pass.
  const others = menuViewOf({
    file: null,
    photos: photosRow(),
    profile: {
      googlePlace: { primaryType: 'bar' },
      menuItems: [
        photoDish('Latte', '4.50', 'm1', { currency: 'USD', priceScale: 1 }),
        photoDish('Tea', '3', 'm1', { currency: 'USD' }),
        photoDish('Bibimbap', '1.2', 'm1', { currency: 'KRW', priceScale: 10000 }),
        photoDish('Bandeja', '1.2', 'm1', { currency: 'COP', priceScale: 1000000 }),
        photoDish('Odd', '5', 'm1', { currency: 'AED', priceScale: 7 })
      ]
    }
  })
  assert.deepEqual(
    others.items.map((i) => i.priceScale),
    [1, null, 10000, 1000000, null]
  )
})

test('the Menu states: never read, read partly, nothing found, photo reading off, not a food place', () => {
  const food = { googlePlace: { primaryType: 'restaurant' } }
  assert.equal(menuViewOf({ profile: food }).state, 'never')
  assert.equal(menuViewOf({ profile: { googlePlace: { primaryType: 'dentist' } } }), null)
  const partial = menuViewOf({
    file: fileRow(),
    photos: photosRow({ collected: { ...photosRow().collected, reading: { status: 'partial' } } }),
    profile: { ...food, menuItems: [fileDish('Hummus', '32')] }
  })
  assert.equal(partial.state, 'partial')
  const none = menuViewOf({
    file: fileRow({ status: 'skipped', reason: 'not_found', collected_at: null, collected: null }),
    photos: photosRow({ collected: { ...photosRow().collected, photos: [] } }),
    profile: food
  })
  assert.deepEqual([none.state, none.reason], ['none', 'no-menu-found'])
  const off = menuViewOf({
    file: fileRow({ status: 'skipped', reason: 'not_found', collected_at: null, collected: null }),
    photos: {
      source: 'menu-photos',
      status: 'skipped',
      reason: 'switched_off',
      attempted_at: AT,
      coverage: { limit: 0 }
    },
    profile: food
  })
  assert.deepEqual([off.state, off.reason, off.counts.limit], ['off', 'photo-reading-off', 0])
  const untested = menuViewOf({
    photos: { source: 'menu-photos', status: 'skipped', reason: 'not_tested', attempted_at: AT },
    profile: food
  })
  assert.deepEqual([untested.state, untested.reason], ['off', 'vision-not-tested'])
  // A hotel whose research holds real dishes still shows them.
  const hotel = menuViewOf({
    file: fileRow(),
    profile: { googlePlace: { primaryType: 'hotel' }, menuItems: [fileDish('Soup', '20')] }
  })
  assert.equal(hotel.applicable, true)
  assert.equal(hotel.items.length, 1)
})

test('Research again runs a menu part a plan names, with the photos it froze and their reserved price', () => {
  const plan = researchAgainPlan(
    { 'menu-file': fileRow() },
    {
      now: Date.parse(AT),
      parts: ['menu-file', 'menu-photos'],
      versions: { 'menu-file': MENU_FILE_VERSION },
      prices: { 'menu-file': 0, 'menu-photos': 3 * menuPhotoCeilingCents('deepseek-flash') },
      custom: { 'menu-photos': { due: true, reason: 'never', photos: ['sha1', 'sha2', 'sha3'] } }
    }
  )
  assert.deepEqual(plan.kept, [{ part: 'menu-file', reason: 'up-to-date' }])
  assert.equal(plan.run.length, 1)
  assert.equal(plan.run[0].part, 'menu-photos')
  assert.deepEqual(plan.run[0].photos, ['sha1', 'sha2', 'sha3'])
  assert.equal(plan.ceilingCents, 3 * menuPhotoCeilingCents('deepseek-flash'))
  assert.equal(againShape(plan).run[0].photos, 3, 'the doors say how many photos, not which hashes')
  const idle = researchAgainPlan(
    {},
    { now: Date.parse(AT), parts: ['menu-photos'], custom: { 'menu-photos': { due: false, kept: 'none' } } }
  )
  assert.deepEqual(idle.kept, [{ part: 'menu-photos', reason: 'none' }])
})

test('the doors read "parts" as a list or a comma-separated query; absent keeps every part, a stranger part is refused', () => {
  assert.deepEqual(againPartsOf(undefined), { parts: null })
  assert.deepEqual(againPartsOf(''), { parts: null })
  assert.deepEqual(againPartsOf('menu-file,menu-photos'), { parts: ['menu-file', 'menu-photos'] })
  assert.deepEqual(againPartsOf(['menu-photos', 'menu-photos']), { parts: ['menu-photos'] })
  assert.ok('error' in againPartsOf(['menu-file', 'logo']))
  assert.ok('error' in againPartsOf([]))
  assert.ok('error' in againPartsOf({ parts: 'menu-file' }))
})

test('a script-rendered menu is read through Jina then Firecrawl, as the default website-content order names them', () => {
  const both = { jina: 'j', firecrawl: 'f' }
  const settings = normalizeWoOpsSettings({})
  assert.deepEqual(menuRendererOrder(settings, both), ['jina', 'firecrawl'])
  assert.deepEqual(menuRendererOrder(settings, { firecrawl: 'f' }), ['firecrawl'])
  assert.deepEqual(menuRendererOrder(settings, {}), [])
  const declared = (order) => ({ ...settings, providerOrder: { 'website-content': order } })
  assert.deepEqual(menuRendererOrder(declared(['direct', 'firecrawl', 'jina']), both), ['firecrawl', 'jina'])
  assert.deepEqual(menuRendererOrder(declared(['direct', 'apify-browser']), both), [])
  // The operator's /ops order without a declaration is the default; saved as shown, it re-reads the same way.
  assert.deepEqual(menuRendererOrder(declared(['direct', 'apify-browser', 'jina', 'firecrawl']), both), [
    'jina',
    'firecrawl'
  ])
  assert.deepEqual(menuRendererOrder(declared(['firecrawl', 'direct']), both), ['firecrawl'])
})
