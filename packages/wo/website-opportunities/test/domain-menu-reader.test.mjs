import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { menuItemsFromHtml, menuItemsFromPdfPages, readMenus } from '../domain/menu-reader.mjs'

const fixture = (name) => readFileSync(new URL(`./fixtures/menu/${name}`, import.meta.url), 'utf8')
const AT = '2026-10-23T10:00:00.000Z'
const SRC = { url: 'https://phin.test/menu', sha256: 'a'.repeat(64), kind: 'page' }
const brief = (items) =>
  items.map(({ name, price, currency, section, verified }) => ({ name, price, currency, section, verified }))

test('an HTML menu page: each dish with the price on its own row, verbatim, under its heading', () => {
  const items = menuItemsFromHtml(fixture('menu-page.html'), { source: SRC, collectedAt: AT })
  assert.deepEqual(brief(items), [
    { name: 'Cà phê sữa đá', price: '45.000đ', currency: 'đ', section: 'Coffee', verified: true },
    { name: 'Egg coffee', price: '55.000đ', currency: 'đ', section: 'Coffee', verified: true },
    { name: 'Bánh mì Phin', price: '65.000', currency: null, section: 'Food', verified: true },
    { name: 'Combo 2', price: '120.000', currency: null, section: 'Food', verified: true },
    { name: 'Phở bò', price: '75.000', currency: null, section: 'Food', verified: true }
  ])
  assert.deepEqual(items[0].source, SRC)
  assert.equal(items[0].collectedAt, AT)
})

test('a price on the line after a dish, not on its row, stays a suggestion', () => {
  const items = menuItemsFromHtml(fixture('menu-near-price.html'), { source: SRC, collectedAt: AT })
  assert.deepEqual(brief(items), [
    { name: 'Grilled sea bass', price: 'AED 95', currency: 'AED', section: 'Specials', verified: false },
    { name: 'Lamb ouzi', price: '120', currency: null, section: 'Specials', verified: false },
    { name: 'Hummus Beiruti', price: 'AED 32', currency: 'AED', section: 'Specials', verified: true }
  ])
})

test('a site builder that sets each dish name and price as its own heading still yields suggestions', () => {
  // Wix: `<h6>English Breakfast</h6><h6>AED 71</h6><p>…</p>` under a section heading.
  const html = `<h2>All-Day Breakfast</h2>
    <div><h6><span>English Breakfast</span></h6></div><div><h6><span>AED 71</span></h6></div>
    <p>Eggs, beef bacon, sausages, hash browns.</p>
    <div><h6><span>Lemon Ricotta Pancake</span></h6></div><div><h6><span>AED 42</span></h6></div>`
  const items = menuItemsFromHtml(html, { source: SRC, collectedAt: AT })
  assert.deepEqual(
    items.map((i) => [i.name, i.price, i.currency, i.section, i.verified]),
    [
      ['English Breakfast', 'AED 71', 'AED', 'All-Day Breakfast', false],
      ['Lemon Ricotta Pancake', 'AED 42', 'AED', 'All-Day Breakfast', false]
    ]
  )
})

test('a dish named by its own heading, its description and price on the row under it, keeps its name', () => {
  // The Willow Nook (thewillownook.example/menu/food, read through Jina, 25/10/2026): each dish is an <h3> over its
  // description and price, so "Eggs, Onions, Thyme, Garlic, and Cheese" became the dish and "Herbie Omelette" its
  // section. A heading over one priced row is that dish; a heading over several stays their section.
  const dish = (name, desc, price) =>
    `<div><div><div><h3>${name}</h3></div><p>${desc}</p></div><span>${price}</span></div>`
  const html = `<h2>Breakfast</h2><p>Mornings need help. Every day until 13:00.</p>
    ${dish('Herbie Omelette', 'Eggs, Onions, Thyme, Garlic, and Cheese', '135 kr')}
    ${dish('Cardamom Belgium Waffles', 'with fresh fruit and raspberry cream', '130 kr')}
    <h3>Coffee Drinks</h3>
    <div><span>Espresso</span><span>33 kr</span></div>
    <div><span>Latte</span><span>52 kr</span></div>`
  const items = menuItemsFromHtml(html, { source: SRC, collectedAt: AT })
  assert.deepEqual(
    items.map((i) => [i.name, i.price, i.section, i.verified]),
    [
      ['Herbie Omelette', '135 kr', 'Breakfast', false],
      ['Cardamom Belgium Waffles', '130 kr', 'Breakfast', false],
      ['Espresso', '33 kr', 'Coffee Drinks', true],
      ['Latte', '52 kr', 'Coffee Drinks', true]
    ]
  )
})

test('a promotion is not a dish: happy hour, "x for y", a deal or offer heading, one price for all, in any language', () => {
  // The Willow Nook (thewillownook.example/specials, 25/10/2026): "Happy hour. Two cocktails. 150 kr." was read as a dish.
  const dish = (name, desc, price) =>
    `<div><div><div><h3>${name}</h3></div><p>${desc}</p></div><span>${price}</span></div>`
  const row = (name, price) => `<div><span>${name}</span><span>${price}</span></div>`
  const html = `<h2>Specials</h2>
    ${row('Brunch, served until 14:00', '165 kr')}
    ${row('Two eggs on toast', '95 kr')}
    ${row('Two cocktails for 150 kr', '150 kr')}
    ${row('To øl for 90 kr', '90 kr')}
    ${row('2 for 1 on draft beer', '60 kr')}
    ${row('All cocktails 75 kr until 18:00', '75 kr')}
    ${row('20% off every bottle of wine', '320 kr')}
    ${row('Breakfast for two', '260 kr')}
    ${dish('Happy Hour', 'Two cocktails. Every day 16–18.', '150 kr')}
    <h3>Weekend deal</h3>
    ${row('Brunch and a mimosa', '189 kr')}
    <h3>Tilbud</h3>
    ${row('Burger og fadøl', '149 kr')}
    <h3>Desserts</h3>
    ${row('Chocolate cake', '75 kr')}
    ${row('Bánh flan khuyến mãi', '25.000đ')}
    ${row('Pastel 2x1', '4,50 €')}
    ${row('Angebot: Kuchen und Kaffee', '6,50 €')}`
  const items = menuItemsFromHtml(html, { source: SRC, collectedAt: AT })
  assert.deepEqual(
    items.map((i) => [i.name, i.price, i.section]),
    [
      ['Brunch, served until 14:00', '165 kr', 'Specials'],
      ['Two eggs on toast', '95 kr', 'Specials'],
      ['Breakfast for two', '260 kr', 'Specials'],
      ['Chocolate cake', '75 kr', 'Desserts']
    ]
  )
})

test('serving hours are not a promotion: "until 14:00", "served 11-15", "from 17:00" keep their dishes', () => {
  // Review 26/10/2026: under "All day breakfast until 14:00" the reader dropped Pancakes and Omelette.
  const row = (name, price) => `<div><span>${name}</span><span>${price}</span></div>`
  const html = `<h2>All day breakfast until 14:00</h2>
    ${row('Pancakes', '95 kr')}
    ${row('Omelette', '110 kr')}
    <h2>Lunch, served 11\u201315</h2>
    ${row('Club sandwich', '145 kr')}
    <h2>Dinner from 17:00</h2>
    ${row('Steak frites', '245 kr')}
    ${row('All burgers come with fries', '165 kr')}
    ${row('Gluten free bread', '35 kr')}
    <h2>Happy hour 16\u201318</h2>
    ${row('Draft beer', '45 kr')}
    <h2>Desserts</h2>
    ${row('Kaffe gratis til brunch', '0 kr')}
    ${row('Tarte -30 %', '6,50 \u20AC')}
    ${row('Croissant offert avec le caf\u00E9', '3 \u20AC')}
    ${row('Get a dessert free with any main', '0 kr')}
    ${row('Tiramisu', '75 kr')}`
  const items = menuItemsFromHtml(html, { source: SRC, collectedAt: AT })
  assert.deepEqual(
    items.map((i) => [i.name, i.section]),
    [
      ['Pancakes', 'All day breakfast until 14:00'],
      ['Omelette', 'All day breakfast until 14:00'],
      ['Club sandwich', 'Lunch, served 11\u201315'],
      ['Steak frites', 'Dinner from 17:00'],
      ['All burgers come with fries', 'Dinner from 17:00'],
      ['Gluten free bread', 'Dinner from 17:00'],
      ['Tiramisu', 'Desserts']
    ]
  )
})

test('a promotion a model read off a menu photo is not a dish either', async () => {
  const { items } = await readMenus({
    photos: [{ url: 'https://lr.test/board.jpg' }],
    readPhoto: async () => [
      { name: 'Happy hour cocktails', price: '89 kr', section: 'Bar' },
      { name: 'Espresso', price: '33 kr', section: 'Bar' },
      { name: 'Latte', price: '52 kr', section: 'Daily offers' }
    ]
  })
  assert.deepEqual(
    items.map((i) => i.name),
    ['Espresso']
  )
})

test('a two-column PDF menu with prices by size: each size its own item, each column its own section', () => {
  const pages = JSON.parse(fixture('two-column-sizes.layout.json'))
  const pdf = { url: 'https://phin.test/menu.pdf', sha256: 'b'.repeat(64), kind: 'pdf' }
  const items = menuItemsFromPdfPages(pages, { source: pdf, collectedAt: AT })
  assert.deepEqual(
    items.map(({ name, price, currency, size, section, verified, source }) => [
      name,
      price,
      currency,
      size ?? null,
      section,
      verified,
      source.page
    ]),
    [
      ['Margherita', '8.50', null, 'Small', 'PIZZA', true, 1],
      ['Margherita', '12.00', null, 'Large', 'PIZZA', true, 1],
      ['Espresso', '2.50', null, null, 'DRINKS', true, 1],
      ['Quattro formaggi', '10.00', null, 'Small', 'PIZZA', true, 1],
      ['Quattro formaggi', '14.50', null, 'Large', 'PIZZA', true, 1],
      ['Lemonade', '€ 3.80', '€', null, 'DRINKS', true, 1],
      // The price sits on the line under the dish: near it, not on its row.
      ['Tiramisu', '6.00', null, null, 'PIZZA', false, 1],
      // Two prices and no heading saying which size each is: which is which would be a guess.
      ['House wine', '7.00', null, null, null, false, 2],
      ['House wine', '28.00', null, null, null, false, 2]
    ]
  )
  assert.equal(items[0].source.url, pdf.url)
})

test('reading the menus research found: pages and PDFs become items, a broken source is reported and keeps its link', async () => {
  const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
  const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake')
  const bodies = {
    'https://phin.test/menu': new Response(fixture('menu-page.html'), {
      headers: { 'content-type': 'text/html' }
    }),
    'https://phin.test/menu.pdf': new Response(pdfBytes, { headers: { 'content-type': 'application/pdf' } }),
    'https://phin.test/gone.pdf': new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/html' }
    })
  }
  const fetch = async (url) => {
    if (url === 'https://phin.test/down') throw new Error('ECONNRESET')
    return bodies[url]
  }
  const pdfText = async (bytes) => {
    assert.equal(new TextDecoder().decode(bytes), '%PDF-1.4 fake')
    return JSON.parse(fixture('two-column-sizes.layout.json'))
  }
  const menus = ['menu', 'menu.pdf', 'gone.pdf', 'down', 'menu'].map((p) => ({
    url: `https://phin.test/${p}`,
    source: 'website'
  }))
  const { items, reads } = await readMenus({ menus, fetch, resolve, pdfText, now: () => Date.parse(AT) })
  assert.deepEqual(
    reads.map(({ url, kind, status, items: n }) => [url.slice(18), kind, status, n]),
    [
      ['menu', 'page', 'complete', 5],
      ['menu.pdf', 'pdf', 'complete', 9],
      ['gone.pdf', 'page', 'failed', 0],
      ['down', 'page', 'failed', 0]
    ]
  )
  assert.equal(items.length, 14)
  assert.deepEqual(items[0].source, {
    url: 'https://phin.test/menu',
    sha256: items[0].source.sha256,
    kind: 'page'
  })
  assert.match(items[0].source.sha256, /^[0-9a-f]{64}$/)
  assert.equal(items[5].source.kind, 'pdf')
  assert.equal(items[0].collectedAt, AT)
})

test('a PDF with no reader on the host is skipped, not guessed', async () => {
  const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
  const fetch = async () =>
    new Response(new TextEncoder().encode('%PDF-1.4'), { headers: { 'content-type': 'application/pdf' } })
  const { items, reads } = await readMenus({ menus: [{ url: 'https://phin.test/m.pdf' }], fetch, resolve })
  assert.deepEqual(items, [])
  assert.deepEqual(
    reads.map((r) => [r.status, r.reason]),
    [['skipped', 'no_pdf_reader']]
  )
})

test('a menu photo read by a model is a suggestion only, with the printed currency and nothing else added', async () => {
  const photos = [
    { url: 'https://maps.test/menu-1.jpg', sha256: 'c'.repeat(64), mediaId: 'm1' },
    { url: 'https://maps.test/menu-2.jpg' }
  ]
  const readPhoto = async (photo) => {
    if (photo.url.endsWith('2.jpg')) throw Object.assign(new Error('model down'), { code: 'provider_error' })
    return [
      { name: ' Shawarma plate ', price: 'AED 38', section: 'Mains' },
      { name: 'Mint tea', price: '12' },
      { name: '', price: '5' }
    ]
  }
  const { items, reads } = await readMenus({
    photos,
    readPhoto,
    fetch: async () => {
      throw new Error('no fetch')
    },
    now: () => Date.parse(AT)
  })
  assert.deepEqual(
    items.map(({ name, price, currency, section, verified, source }) => [
      name,
      price,
      currency,
      section,
      verified,
      source.kind
    ]),
    [
      ['Shawarma plate', 'AED 38', 'AED', 'Mains', false, 'photo'],
      ['Mint tea', '12', null, null, false, 'photo']
    ]
  )
  assert.deepEqual(
    reads.map((r) => [r.kind, r.status, r.reason ?? null]),
    [
      ['photo', 'complete', null],
      ['photo', 'failed', 'provider_error']
    ]
  )
})

test('a menu page drawn by script (no item, no readable text) needs a rendered read: never "complete"', async () => {
  const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
  const shell =
    '<!doctype html><html><head><title>The Willow Nook</title><script type="module" src="/assets/index-a1b2.js"></script>' +
    '<style>body{margin:0}</style></head><body><div id="root"></div><noscript>You need to enable JavaScript.</noscript></body></html>'
  const prose =
    '<html><body><main><h1>Our menu</h1><p>We change the menu with the seasons; ask our team what is cooking today, ' +
    'or follow us for the weekly specials and the brunch on Sundays, served from ten until three in the afternoon.</p></main></body></html>'
  const bodies = { 'https://lr.test/menu/food': shell, 'https://lr.test/menu/about': prose }
  const fetch = async (url) => new Response(bodies[url], { headers: { 'content-type': 'text/html' } })
  const { items, reads } = await readMenus({
    menus: [{ url: 'https://lr.test/menu/food' }, { url: 'https://lr.test/menu/about' }],
    fetch,
    resolve
  })
  assert.deepEqual(items, [])
  assert.deepEqual(
    reads.map((r) => [r.url.slice(20), r.status, r.reason ?? null, r.items]),
    [
      ['/food', 'needs_render', 'no_readable_text', 0],
      // A page with words and no dish is read, and holds none.
      ['/about', 'complete', null, 0]
    ]
  )
})

test('a menu page drawn by script is read again through the rendered readers in order; none configured, it stays needs_render', async () => {
  const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
  const shell =
    '<!doctype html><html><head><script type="module" src="/assets/index-a1b2.js"></script></head>' +
    '<body><div id="root"></div></body></html>'
  const rendered = fixture('menu-page.html')
  const fetch = async () => new Response(shell, { headers: { 'content-type': 'text/html' } })
  const menus = [{ url: 'https://lr.test/menu/food' }]
  const asked = []
  const reader = (provider, html) => ({
    provider,
    read: async (url) => {
      asked.push([provider, url])
      return html === null ? null : { url, html }
    }
  })
  // Jina gives nothing usable, Firecrawl gives the drawn page: its dishes are read by the same parser.
  const { items, reads } = await readMenus({
    menus,
    fetch,
    resolve,
    renderers: [reader('jina', null), reader('firecrawl', rendered)]
  })
  assert.deepEqual(asked, [
    ['jina', 'https://lr.test/menu/food'],
    ['firecrawl', 'https://lr.test/menu/food']
  ])
  assert.deepEqual(
    items.map((i) => [i.name, i.price, i.source.kind, i.source.via]),
    [
      ['Cà phê sữa đá', '45.000đ', 'page', 'firecrawl'],
      ['Egg coffee', '55.000đ', 'page', 'firecrawl'],
      ['Bánh mì Phin', '65.000', 'page', 'firecrawl'],
      ['Combo 2', '120.000', 'page', 'firecrawl'],
      ['Phở bò', '75.000', 'page', 'firecrawl']
    ]
  )
  assert.deepEqual(
    reads.map((r) => [r.status, r.items, r.rendered ?? null]),
    [['complete', 5, 'firecrawl']]
  )
  // The first reader that reads dishes ends the round: no second call.
  asked.length = 0
  await readMenus({
    menus,
    fetch,
    resolve,
    renderers: [reader('jina', rendered), reader('firecrawl', rendered)]
  })
  assert.deepEqual(asked, [['jina', 'https://lr.test/menu/food']])
  // No reader configured: no call, the read stays missing data.
  const none = await readMenus({ menus, fetch, resolve, renderers: [] })
  assert.deepEqual(
    none.reads.map((r) => [r.status, r.reason]),
    [['needs_render', 'no_readable_text']]
  )
  // A rendered read that still holds no dish leaves it as it was, and says which readers were asked.
  const empty = await readMenus({ menus, fetch, resolve, renderers: [reader('jina', shell)] })
  assert.deepEqual(
    empty.reads.map((r) => [r.status, r.reason, r.renderedBy]),
    [['needs_render', 'no_readable_text', ['jina']]]
  )
})
