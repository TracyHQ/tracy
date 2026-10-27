/**
 * The Menu block of a place card: the server's `menu` read safely (hidden when the place is not a food place),
 * the summary of where dishes came from, dishes grouped by section as printed with one source chip per group,
 * prices exactly as printed (never guessed), and the result line under each menu photo.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collapseMenu, menuAgainTarget, menuView, photoResult, readMenu } from '../src/client/menu-model.ts'

const item = (name, extra = {}) => ({
  name,
  price: '58',
  currency: 'AED',
  currencyAssumed: false,
  section: null,
  size: null,
  source: { kind: 'file', url: 'https://sushi.example/menu.pdf', mediaId: null },
  verified: false,
  otherPrices: [],
  ...extra
})
const fromPhoto = (mediaId) => ({ kind: 'photo', url: `https://maps.example/${mediaId}`, mediaId })

const MENU = {
  applicable: true,
  state: 'read',
  reason: null,
  readAt: '2026-10-24T09:12:00Z',
  currency: 'AED',
  counts: { file: 2, photo: 3, photosRead: 4, photosTotal: 4, limit: 24 },
  items: [
    item('Dragon Roll', { section: 'Sushi rolls' }),
    item('Spicy Tuna Roll', { section: 'Sushi rolls', price: '46' }),
    item('House wine', {
      section: 'Happy hour',
      price: '35',
      source: fromPhoto('m2'),
      otherPrices: [{ price: '39', mediaId: 'm3' }]
    }),
    item('Heineken', { section: 'Happy hour', price: '35', source: fromPhoto('m2') }),
    item('Premium package', { section: 'Business lunch', price: null, source: fromPhoto('m4') })
  ],
  files: [
    { url: 'https://sushi.example/menu.pdf', name: 'menu.pdf', items: 2, readAt: '2026-10-24T09:12:00Z' }
  ],
  photos: [
    { mediaId: 'm1', result: 'not-menu', items: 0, sameAs: null },
    { mediaId: 'm2', result: 'menu', items: 2, sameAs: null },
    { mediaId: 'm3', result: 'same-menu', items: 0, sameAs: 'm2' },
    { mediaId: 'm4', result: 'menu', items: 1, sameAs: null }
  ]
}

test('no menu block for a place that is not a food place, or when the server sent none', () => {
  assert.equal(readMenu(null), null)
  assert.equal(readMenu(undefined), null)
  assert.equal(readMenu({ ...MENU, applicable: false }), null)
  assert.equal(readMenu('menu'), null)
})

test('an unknown state reads as never read; broken rows are dropped, prices stay as printed', () => {
  const menu = readMenu({ ...MENU, state: 'mystery', items: [...MENU.items, { price: '9' }, 'x'] })
  assert.equal(menu.state, 'never')
  assert.equal(menu.items.length, 5)
  assert.equal(menu.items[4].price, null)
  assert.equal(menu.items[0].price, '58')
})

test('summary: dishes from the file, dishes from photos and how many photos they came from', () => {
  const view = menuView(readMenu(MENU))
  assert.deepEqual(view.summary, { total: 5, file: 2, photo: 3, photos: 2 })
  assert.equal(view.currency, 'AED')
  assert.equal(view.readAt, '2026-10-24T09:12:00Z')
})

test('sections keep the printed order, one source chip each; a photo chip names its photo number and opens it', () => {
  const view = menuView(readMenu(MENU))
  assert.deepEqual(
    view.sections.map((s) => [s.title, s.items.map((i) => i.name)]),
    [
      ['Sushi rolls', ['Dragon Roll', 'Spicy Tuna Roll']],
      ['Happy hour', ['House wine', 'Heineken']],
      ['Business lunch', ['Premium package']]
    ]
  )
  assert.deepEqual(view.sections[0].chip, {
    kind: 'file',
    key: null,
    params: { name: 'menu.pdf' },
    href: 'https://sushi.example/menu.pdf',
    mediaId: null
  })
  assert.deepEqual(view.sections[1].chip, {
    kind: 'photo',
    key: 'menu.chip.photo',
    params: { n: 2 },
    href: null,
    mediaId: 'm2'
  })
  assert.equal(view.sections[2].chip.params.n, 4)
})

test('the same section read from the file and from a photo is two groups, so each chip is honest', () => {
  const menu = readMenu({
    ...MENU,
    items: [
      item('A', { section: 'Drinks' }),
      item('B', { section: 'Drinks', source: fromPhoto('m2') }),
      item('C', { section: 'Drinks' })
    ]
  })
  const view = menuView(menu)
  assert.deepEqual(
    view.sections.map((s) => [s.title, s.chip.kind, s.items.map((i) => i.name)]),
    [
      ['Drinks', 'file', ['A', 'C']],
      ['Drinks', 'photo', ['B']]
    ]
  )
})

test('a missing price says so, never a guess; other prices from other photos are listed with their photo', () => {
  const view = menuView(readMenu(MENU))
  const [wine] = view.sections[1].items
  assert.equal(wine.price, '35')
  assert.deepEqual(wine.otherPrices, [{ price: '39', photo: 3, mediaId: 'm3' }])
  const [premium] = view.sections[2].items
  assert.equal(premium.price, null)
})

test('a price in another currency than the menu carries its currency', () => {
  const view = menuView(
    readMenu({ ...MENU, items: [item('Tea', { price: '4', currency: 'USD' }), item('Rice')] })
  )
  assert.deepEqual(
    view.sections[0].items.map((i) => i.price),
    ['4 USD', '58']
  )
})

// Lee (24/10/2026): the server sends the printed number and the scale the menu states; the card shows the amount it
// means, short, in the viewer's language. Any currency; a full or unknown scale shows exactly as printed.
test('a shortened price shows as the amount it means; full or unknown scales show as printed; so do other prices', () => {
  const view = menuView(
    readMenu({
      ...MENU,
      currency: 'VND',
      items: [
        item('CAPTAIN MORGAN GOLD', { price: '110', currency: 'VND', size: '50ML', priceScale: 1000 }),
        item('CAPTAIN MORGAN GOLD', { price: '1485', currency: 'VND', size: '750ML', priceScale: 1000 }),
        item('Bibimbap', { price: '1.2', currency: 'VND', priceScale: 10000 }),
        item('Bandeja', { price: '1.2', currency: 'VND', priceScale: 1000000 }),
        item('Negroni', {
          price: null,
          currency: null,
          otherPrices: [
            { price: '220', mediaId: 'm3', priceScale: 1000 },
            { price: '250000', mediaId: null, priceScale: null }
          ]
        }),
        item('Latte', { price: '4.50', currency: 'VND', priceScale: 1 }),
        item('Mojito', { price: '120', currency: 'VND', priceScale: null }),
        item('Odd', { price: '65', currency: 'VND', priceScale: 7 })
      ]
    }),
    'en'
  )
  const dishes = view.sections[0].items
  assert.deepEqual(
    dishes.map((d) => d.price),
    ['110K', '1.485M', '12K', '1.2M', null, '4.50', '120', '65']
  )
  assert.deepEqual(
    dishes[4].otherPrices.map((o) => o.price),
    ['220K', '250000']
  )
})

test('dishes without a section group under no title; a file chip without a known name uses the file name of its address', () => {
  const view = menuView(
    readMenu({
      ...MENU,
      files: [],
      items: [
        item('Soup', {
          source: { kind: 'file', url: 'https://x.example/a/Carte%20du%20jour.pdf', mediaId: null }
        })
      ]
    })
  )
  assert.equal(view.sections[0].title, null)
  assert.deepEqual(view.sections[0].chip.params, { name: 'Carte du jour.pdf' })
})

test('collapsed: a few dishes per section and a count of the rest; expanded: everything', () => {
  const many = Array.from({ length: 7 }, (_, i) => item(`Roll ${i + 1}`, { section: 'Sushi rolls' }))
  const view = menuView(readMenu({ ...MENU, items: [...many, ...MENU.items.slice(2)] }))
  const short = collapseMenu(view, false)
  assert.deepEqual(
    short.sections[0].items.map((i) => i.name),
    ['Roll 1', 'Roll 2', 'Roll 3']
  )
  assert.equal(short.sections[0].more, 4)
  assert.equal(short.hidden, 4)
  const all = collapseMenu(view, true)
  assert.equal(all.sections[0].items.length, 7)
  assert.equal(all.sections[0].more, 0)
  assert.equal(all.hidden, 0)
})

test('collapsed shows at most four sections; the rest count as hidden dishes', () => {
  const items = ['A', 'B', 'C', 'D', 'E'].map((s) => item(`${s} dish`, { section: s }))
  const short = collapseMenu(menuView(readMenu({ ...MENU, items })), false)
  assert.equal(short.sections.length, 4)
  assert.equal(short.hidden, 1)
})

test('the line under each menu photo: dishes, not a menu, same menu as photo N, over the limit, not read', () => {
  const menu = readMenu({
    ...MENU,
    photos: [
      ...MENU.photos,
      { mediaId: 'm5', result: 'unreadable', items: 0, sameAs: null },
      { mediaId: 'm6', result: 'over-limit', items: 0, sameAs: null },
      { mediaId: 'm7', result: 'unread', items: 0, sameAs: null },
      { mediaId: 'm8', result: 'same-menu', items: 0, sameAs: 'gone' }
    ]
  })
  assert.deepEqual(photoResult(menu, 'm2'), {
    n: 2,
    key: 'menu.photo.dishes',
    params: { count: 2 },
    tone: 'ok'
  })
  assert.deepEqual(photoResult(menu, 'm1'), { n: 1, key: 'menu.photo.notMenu', params: {}, tone: 'none' })
  assert.deepEqual(photoResult(menu, 'm3'), {
    n: 3,
    key: 'menu.photo.sameAs',
    params: { n: 2 },
    tone: 'none'
  })
  assert.deepEqual(photoResult(menu, 'm5'), { n: 5, key: 'menu.photo.unreadable', params: {}, tone: 'warn' })
  assert.deepEqual(photoResult(menu, 'm6'), {
    n: 6,
    key: 'menu.photo.overLimit',
    params: { limit: 24 },
    tone: 'none'
  })
  assert.deepEqual(photoResult(menu, 'm7'), { n: 7, key: 'menu.photo.unread', params: {}, tone: 'none' })
  assert.deepEqual(photoResult(menu, 'm8'), { n: 8, key: 'menu.photo.sameOther', params: {}, tone: 'none' })
  assert.equal(photoResult(menu, 'not-a-menu-photo'), null)
  assert.equal(photoResult(null, 'm1'), null)
})

// Lee (24/10/2026): reading stops after 4 not-menus in a row past the labeled photos; the photos left say why.
test('a photo past the not-menu streak says it was not read because the photos before it were not menus', () => {
  const menu = readMenu({
    ...MENU,
    photos: [...MENU.photos, { mediaId: 'm9', result: 'stopped-early', items: 0, sameAs: null }]
  })
  assert.deepEqual(photoResult(menu, 'm9'), {
    n: MENU.photos.length + 1,
    key: 'menu.photo.stoppedEarly',
    params: {},
    tone: 'none'
  })
  // An older server never sends it; a result this client does not know reads as not read yet.
  const old = readMenu({
    ...MENU,
    photos: [{ mediaId: 'm1', result: 'something-new', items: 0, sameAs: null }]
  })
  assert.equal(photoResult(old, 'm1').key, 'menu.photo.unread')
})

test('status line for a menu with no dishes or only partly read: neutral words for the customer', () => {
  const never = menuView(
    readMenu({
      ...MENU,
      state: 'never',
      items: [],
      counts: { ...MENU.counts, photosTotal: 11 },
      files: [MENU.files[0]]
    })
  )
  assert.deepEqual(never.status, {
    tone: 'warn',
    key: 'menu.state.never',
    whyKey: 'menu.why.never',
    params: { photos: 11, files: 1 },
    action: 'read'
  })
  const none = menuView(readMenu({ ...MENU, state: 'none', items: [], files: [], photos: [] }))
  assert.deepEqual(none.status, {
    tone: 'none',
    key: 'menu.state.none',
    whyKey: 'menu.why.none',
    params: { date: MENU.readAt },
    action: null
  })
  assert.equal(
    menuView(readMenu({ ...MENU, state: 'none', items: [], readAt: null })).status.whyKey,
    'menu.why.noneUndated'
  )
  const fileOnly = menuView(readMenu({ ...MENU, state: 'partial', reason: 'photo-reading-off' }))
  assert.equal(fileOnly.status.key, 'menu.state.fileOnly')
  assert.equal(fileOnly.status.whyKey, 'menu.why.photosOff')
  assert.equal(fileOnly.status.action, 'again')
  assert.deepEqual(
    menuView(readMenu({ ...MENU, state: 'partial', reason: 'vision-not-tested' })).status.whyKey,
    'menu.why.photosOff'
  )
  assert.equal(
    menuView(readMenu({ ...MENU, state: 'partial', reason: null })).status.whyKey,
    'menu.why.partly'
  )
  assert.equal(menuView(readMenu({ ...MENU, state: 'off', items: [] })).status.whyKey, 'menu.why.off')
  assert.equal(menuView(readMenu(MENU)).status, null)
})

// Dev 26/10/2026 (#1780 acceptance): every Details load of a coaching club, a place with no Menu, asked
// `GET …/research-again?parts=menu-file,menu-photos`. Read menu again previews only a place whose Menu applies.
test('Read menu again asks for a preview only when the place has a Menu', () => {
  assert.equal(menuAgainTarget('opp-1', MENU), 'opp-1')
  assert.equal(menuAgainTarget('opp-1', null), null, 'the detail answer says no Menu: nothing to read again')
  assert.equal(menuAgainTarget('opp-1', undefined), null, 'not loaded yet: wait')
  assert.equal(menuAgainTarget('opp-1', { ...MENU, applicable: false }), null)
  assert.equal(menuAgainTarget(null, MENU), null)
})
