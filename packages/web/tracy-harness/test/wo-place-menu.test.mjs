// /ops/wo › Places inspector, Menu block (`src/WoPlaceMenu.tsx`): the pure helpers it draws the `menu` field with.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  MENU_PARTS,
  formatCallCents,
  itemPriceText,
  otherPricesText,
  sectionSourceLabel,
  menuStatus,
  menuSummaryParts,
  itemSourceLabel,
  menuSections,
  partsOutside,
  photoResultLabel
} from '../src/wo-place-menu.ts'
import { en } from '../src/i18n/ns/wo-places.ts'
import { translate } from '../src/i18n/translator.ts'

/** The screens' English, as `useT()` reads it with no language loaded. */
const t = (key, params) => translate('en', {}, en, key, params)

const PHOTOS = [
  { mediaId: 'm1', result: 'menu', items: 9, sameAs: null },
  { mediaId: 'm2', result: 'menu', items: 6, sameAs: null },
  { mediaId: 'm3', result: 'same-menu', items: 0, sameAs: 'm2' },
  { mediaId: 'm4', result: 'not-menu', items: 0, sameAs: null },
  { mediaId: 'm5', result: 'unreadable', items: 0, sameAs: null },
  { mediaId: 'm6', result: 'over-limit', items: 0, sameAs: null },
  { mediaId: 'm7', result: 'unread', items: 0, sameAs: null },
  { mediaId: 'm8', result: 'menu', items: 1, sameAs: null }
]

// Lee (24/10/2026): reading stops after 4 not-menus in a row past the labeled photos.
test('a photo past the not-menu streak says why it was not read; an unknown result reads as not read yet', () => {
  const stopped = { mediaId: 'm9', result: 'stopped-early', items: 0, sameAs: null }
  assert.equal(photoResultLabel(t, stopped, [stopped], 24), 'Not read — the photos before it were not menus')
  const unknown = { mediaId: 'm1', result: 'something-new', items: 0, sameAs: null }
  assert.equal(photoResultLabel(t, unknown, [unknown], 24), 'Not read yet')
})

test('a Read menu again plan that would run a part outside the menu is caught (a server that ignored `parts`)', () => {
  const plan = (parts) => ({
    run: parts.map((part) => ({ part, reason: 'never', ceilingCents: 1 })),
    kept: [],
    ceilingCents: 1
  })
  assert.deepEqual(partsOutside(plan(['menu-file', 'menu-photos']), MENU_PARTS), [])
  assert.deepEqual(partsOutside(plan(['menu-photos', 'facebook', 'website']), MENU_PARTS), [
    'facebook',
    'website'
  ])
})

test('each photo says what reading it found, naming photos by their place in the list', () => {
  const label = (i) => photoResultLabel(t, PHOTOS[i], PHOTOS, 24)
  assert.equal(label(0), '9 dishes')
  assert.equal(label(7), '1 dish')
  assert.equal(label(2), 'Same menu as photo 2')
  assert.equal(label(3), 'Not a menu')
  assert.equal(label(4), 'Too blurry to read')
  assert.equal(label(5), 'Not read — over the limit of 24')
  assert.equal(label(6), 'Not read yet')
  assert.equal(photoResultLabel(t, { ...PHOTOS[0], items: 0 }, PHOTOS, 24), 'Menu, no dishes read')
  assert.equal(
    photoResultLabel(t, { ...PHOTOS[2], sameAs: 'gone' }, PHOTOS, 24),
    'Same menu as another photo'
  )
})

const item = (over) => ({
  name: 'Dragon Roll',
  price: '58',
  currency: 'AED',
  currencyAssumed: false,
  section: 'Sushi rolls',
  size: null,
  source: { kind: 'file', url: 'https://sushi.example/menu.pdf', mediaId: null },
  verified: false,
  otherPrices: [],
  ...over
})
const FILES = [{ url: 'https://sushi.example/menu.pdf', name: 'menu.pdf', items: 30, readAt: null }]

test('dishes keep their order and group under the section the menu printed', () => {
  const items = [
    item({ name: 'A' }),
    item({ name: 'B', section: 'Happy hour' }),
    item({ name: 'C' }),
    item({ name: 'D', section: null })
  ]
  assert.deepEqual(
    menuSections(items).map((s) => [s.section, s.items.map((i) => i.name)]),
    [
      ['Sushi rolls', ['A', 'C']],
      ['Happy hour', ['B']],
      [null, ['D']]
    ]
  )
})

// Lee (24/10/2026): the printed number with the scale the menu states, in any currency; full or unknown as printed.
test('a shortened price shows as the amount it means, other prices too; full or unknown scales as printed', () => {
  assert.equal(itemPriceText(t, item({ price: '110', size: '50ML', priceScale: 1000 })), '50ML · 110K')
  assert.equal(itemPriceText(t, item({ price: '1.2', priceScale: 1000000 })), '1.2M')
  assert.equal(itemPriceText(t, item({ price: '4.50', priceScale: 1 })), '4.50')
  assert.equal(itemPriceText(t, item({ price: '120', priceScale: null })), '120')
  assert.equal(
    otherPricesText(
      t,
      item({
        otherPrices: [
          { price: '220', mediaId: 'm2', priceScale: 1000 },
          { price: '250000', mediaId: null, priceScale: null }
        ]
      }),
      PHOTOS
    ),
    'Prices differ between photos: 220K (photo 2), 250000'
  )
})

test('a price shows only when printed, with its size; another price a photo printed is its own line', () => {
  assert.equal(itemPriceText(t, item({})), '58')
  assert.equal(itemPriceText(t, item({ price: null })), 'no price printed')
  assert.equal(itemPriceText(t, item({ size: 'Large' })), 'Large · 58')
  assert.equal(itemPriceText(t, item({ otherPrices: [{ price: '62', mediaId: 'm2' }] })), '58')
  assert.equal(otherPricesText(t, item({}), PHOTOS), null)
  assert.equal(
    otherPricesText(
      t,
      item({
        otherPrices: [
          { price: '62', mediaId: 'm2' },
          { price: '60', mediaId: null }
        ]
      }),
      PHOTOS
    ),
    'Prices differ between photos: 62 (photo 2), 60'
  )
})

test('a section whose dishes were all read from one source names it once', () => {
  const photo2 = { kind: 'photo', url: 'https://g/2', mediaId: 'm2' }
  assert.equal(sectionSourceLabel(t, [item({}), item({ name: 'B' })], FILES, PHOTOS), 'menu.pdf')
  assert.equal(sectionSourceLabel(t, [item({}), item({ source: photo2 })], FILES, PHOTOS), null)
})

test('each dish names where it was read: the file by its name, a photo by its number', () => {
  assert.equal(itemSourceLabel(t, item({}), FILES, PHOTOS), 'menu.pdf')
  assert.equal(
    itemSourceLabel(
      t,
      item({ source: { kind: 'file', url: 'https://x.example/carte/', mediaId: null } }),
      FILES,
      PHOTOS
    ),
    'x.example/carte/'
  )
  assert.equal(
    itemSourceLabel(t, item({ source: { kind: 'photo', url: 'https://g/1', mediaId: 'm2' } }), FILES, PHOTOS),
    'photo 2'
  )
  assert.equal(
    itemSourceLabel(
      t,
      item({ source: { kind: 'photo', url: 'https://g/1', mediaId: 'gone' } }),
      FILES,
      PHOTOS
    ),
    'a photo'
  )
})

const MENU = {
  applicable: true,
  state: 'read',
  reason: null,
  readAt: '2026-10-24T09:12:00.000Z',
  currency: 'AED',
  counts: { file: 30, photo: 12, photosRead: 11, photosTotal: 11, limit: 24 },
  items: [item({}), item({ name: 'Heineken' })],
  files: FILES,
  photos: [
    { mediaId: 'm1', result: 'menu', items: 9, sameAs: null, costCents: 1.5, model: 'deepseek-flash' },
    { mediaId: 'm2', result: 'not-menu', items: 0, sameAs: null, costCents: 0.9, model: 'deepseek-flash' },
    { mediaId: 'm3', result: 'over-limit', items: 0, sameAs: null }
  ]
}

test('a fully read menu has no status row; every other state says why, with the real reason for an operator', () => {
  assert.equal(menuStatus(t, MENU), null)
  assert.deepEqual(menuStatus(t, { ...MENU, state: 'never', items: [] }), {
    title: 'Never read',
    why: 'This place has 11 menu photos and 1 menu file. Tracy has not read them yet.'
  })
  assert.deepEqual(menuStatus(t, { ...MENU, state: 'none', reason: 'no-menu-found', items: [] }), {
    title: 'No menu found',
    why: 'No menu file or menu photo was found for this place.'
  })
  assert.deepEqual(
    menuStatus(t, {
      ...MENU,
      state: 'off',
      reason: 'photo-reading-off',
      counts: { ...MENU.counts, file: 30 }
    }),
    {
      title: 'Only the file was read',
      why: '30 dishes from the menu file. Photo reading is off: Menu photos read per place is 0, or Menu photos is not in the menu provider order.'
    }
  )
  assert.deepEqual(
    menuStatus(t, {
      ...MENU,
      state: 'off',
      reason: 'vision-not-tested',
      counts: { ...MENU.counts, file: 0 }
    }),
    {
      title: 'Menu photos not read',
      why: 'Photo reading is off: the vision model has not passed its picture test.'
    }
  )
  assert.deepEqual(menuStatus(t, { ...MENU, state: 'partial', reason: null }), {
    title: 'Read partly',
    why: '30 dishes from the menu file. Some menu photos could not be read this time; run Read menu again.'
  })
  assert.deepEqual(menuStatus(t, { ...MENU, applicable: false, state: 'none', reason: 'not-food' }), {
    title: 'Not a food place',
    why: 'Menus are read only for places that serve food.'
  })
})

test('the summary names the model, how many photos were read, what it cost and the dishes kept', () => {
  assert.deepEqual(menuSummaryParts(t, MENU), [
    'model deepseek-flash',
    '11 photos read of 11 (limit 24)',
    '$0.024 spent',
    '2 dishes kept',
    'prices in AED'
  ])
  assert.deepEqual(menuSummaryParts(t, { ...MENU, photos: [], currency: null, items: [item({})] }), [
    '11 photos read of 11 (limit 24)',
    '1 dish kept'
  ])
})

test('a vision call can cost less than a cent: its cost keeps the fraction', () => {
  assert.equal(formatCallCents(1.5), '$0.015')
  assert.equal(formatCallCents(0), '$0.00')
  assert.equal(formatCallCents(12), '$0.12')
  assert.equal(formatCallCents(undefined), '—')
  assert.equal(formatCallCents(1.5, 'fr-FR').replace(/\s/g, ' '), '0,015 $US')
})
