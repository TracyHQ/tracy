import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pinnedCopy } from '../domain/pinned-copy.mjs'

const story = {
  id: 'post:facebook:1',
  lang: 'en',
  kinds: ['story'],
  title: 'The Blue Door',
  body: 'We opened in Sapa in 2015. The blue door came with us to Hoi An.',
  authorship: 'page'
}
const dish = (n, extra = {}) => ({
  id: `post:instagram:${n}`,
  lang: 'en',
  kinds: ['dish'],
  title: `Dish ${n}`,
  body: `Dish ${n} is slow cooked for six hours. Served with bread.`,
  authorship: 'page',
  ...extra
})

const brief = (over = {}) => ({
  business: {
    name: 'The Larch House',
    address: '321 Tran Phu, Hoi An',
    phone: '+84 235 0000 102',
    hours: ['Mon–Sun 7:00–22:00'],
    ...over.business
  },
  sitemap: [
    {
      slug: 'home',
      sections: [
        {
          kind: 'hero',
          copy: 'x',
          cta: over.cta ?? { kind: 'phone', label: 'Call', href: 'tel:+842350000102' }
        }
      ]
    },
    {
      slug: 'about',
      sections: [
        {
          kind: 'story',
          evidence:
            over.bio === null
              ? []
              : [
                  {
                    quote:
                      over.bio ?? 'A Highland kitchen and wine bar in the old town of Hoi An. Open all day.',
                    source: 'profile.bio'
                  }
                ]
        }
      ]
    }
  ],
  content: { items: over.items ?? [story, dish(1), dish(2)] }
})

test('every pinned value names where it came from', () => {
  const p = pinnedCopy(brief(), { lang: 'en' })
  assert.deepEqual(p['hero.title'], { value: 'The Larch House', source: 'business.name' })
  assert.deepEqual(p['hero.lead'], {
    value: 'A Highland kitchen and wine bar in the old town of Hoi An.',
    source: 'profile.bio'
  })
  assert.deepEqual(p['hero.cta'], {
    value: { label: 'Call', href: 'tel:+842350000102' },
    source: 'business.phone'
  })
  assert.deepEqual(p['about.story'], {
    value: { title: 'The Blue Door', text: story.body },
    source: 'post:facebook:1'
  })
  assert.equal(p.cards.length, 2)
  assert.deepEqual(p.cards[0], {
    value: { title: 'Dish 1', text: 'Dish 1 is slow cooked for six hours.' },
    source: 'post:instagram:1'
  })
})

test('a booking CTA keeps its link; a social CTA is not a hero button', () => {
  assert.deepEqual(
    pinnedCopy(
      brief({ cta: { kind: 'booking', label: 'Book a table', href: 'https://book.example/hill' } }),
      { lang: 'en' }
    )['hero.cta'],
    { value: { label: 'Book a table', href: 'https://book.example/hill' }, source: 'business.booking' }
  )
  assert.equal(
    pinnedCopy(
      brief({ cta: { kind: 'social', label: 'Follow on Instagram', href: 'https://instagram.com/x' } }),
      { lang: 'en' }
    )['hero.cta'],
    undefined
  )
})

test('no source, no pin: missing bio, other-language text and credited posts are left to the template', () => {
  const p = pinnedCopy(
    brief({ bio: null, items: [{ ...story, lang: 'vi' }, dish(3, { authorship: 'credited' })] }),
    { lang: 'en' }
  )
  assert.equal(p['hero.lead'], undefined)
  assert.equal(p['about.story'], undefined)
  assert.deepEqual(p.cards, [])
  assert.equal(
    pinnedCopy(brief({ bio: 'Nhà hàng ở phố cổ Hội An, mở cửa cả ngày.' }), { lang: 'en' })['hero.lead'],
    undefined
  )
})

test('a lead never carries an offer or a date that may have passed', () => {
  assert.equal(
    pinnedCopy(brief({ bio: '50% off all cocktails until Sunday! Book now.' }), { lang: 'en' })['hero.lead'],
    undefined
  )
})

test('cards stop at the asked number and keep the pool order', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => dish(n))
  const p = pinnedCopy(brief({ items }), { lang: 'en', cards: 3 })
  assert.deepEqual(
    p.cards.map((c) => c.source),
    ['post:instagram:1', 'post:instagram:2', 'post:instagram:3']
  )
})

test('contact facts are passed as they were collected, hours joined in order', () => {
  const p = pinnedCopy(
    brief({ business: { email: 'hello@hill.example', hours: ['Mon–Fri 7:00–22:00', 'Sat–Sun 8:00–23:00'] } }),
    { lang: 'en' }
  )
  assert.deepEqual(p.contact, {
    phone: { value: '+84 235 0000 102', source: 'business.phone' },
    email: { value: 'hello@hill.example', source: 'business.email' },
    address: { value: '321 Tran Phu, Hoi An', source: 'business.address' },
    hours: { value: 'Mon–Fri 7:00–22:00; Sat–Sun 8:00–23:00', source: 'business.hours' }
  })
})

test('the hero accent is the cuisine as collected, joined; none collected, none pinned', () => {
  assert.deepEqual(
    pinnedCopy(brief({ business: { cuisine: ['Vietnamese', ' Highland '] } }), { lang: 'en' })['hero.accent'],
    { value: 'Vietnamese, Highland', source: 'business.cuisine' }
  )
  assert.equal(pinnedCopy(brief(), { lang: 'en' })['hero.accent'], undefined)
  assert.equal(
    pinnedCopy(brief({ business: { cuisine: ['', ' '] } }), { lang: 'en' })['hero.accent'],
    undefined
  )
})

test('opening hours collected as day lists read as day ranges; other shapes are kept as written', () => {
  const p = pinnedCopy(
    brief({ business: { hours: ['Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday 07:00-22:00'] } }),
    { lang: 'en' }
  )
  assert.equal(p.contact.hours.value, 'Mon–Sun 07:00–22:00')
  const q = pinnedCopy(
    brief({
      business: {
        hours: ['Monday,Tuesday,Wednesday 08:00-17:00', 'Friday,Saturday 09:00-23:00', 'Closed on holidays']
      }
    }),
    { lang: 'en' }
  )
  assert.equal(q.contact.hours.value, 'Mon–Wed 08:00–17:00; Fri–Sat 09:00–23:00; Closed on holidays')
  const r = pinnedCopy(brief({ business: { hours: ['Monday,Wednesday,Friday 10:00-14:00'] } }), {
    lang: 'en'
  })
  assert.equal(r.contact.hours.value, 'Mon, Wed, Fri 10:00–14:00')
})

test('menu dishes are only items the research called a dish, named by a heading with a food word; never a price', () => {
  // A heading the restaurant set on its post (Unicode bold or capitals): the pool takes it as the title.
  const named = (n, title, body, extra = {}) => dish(n, { title, body, ...extra })
  const items = [
    named(
      1,
      'Chicken & Chorizo Stew',
      'Slow cooked for the rainy days, $5 a bowl. Served with bread from our bakery.'
    ),
    named(2, 'Good coffee makes a difference', 'Good coffee makes a difference. Come by.'),
    named(3, 'Something New from the Highlands', 'Our coffee blend with Origin is on the shelves.'),
    named(4, 'Chicken Pho', 'Hot and fresh.', { kinds: ['dish', 'event'] }),
    named(5, 'Beef Stew', 'Hot and fresh.', { temporal: { status: 'past' } }),
    named(6, 'Duck Salad', 'Duck salad with herbs from the garden.'),
    named(7, 'Prawn Curry', '120k only today!')
  ]
  const p = pinnedCopy(brief({ items }), { lang: 'en', dishes: 6 })
  assert.deepEqual(
    p.dishes.map((d) => d.source),
    ['post:instagram:1', 'post:instagram:6', 'post:instagram:7']
  )
  assert.deepEqual(p.dishes[0].value, {
    name: 'Chicken & Chorizo Stew',
    description: 'Served with bread from our bakery.'
  })
  assert.equal(p.dishes[2].value.description, '', 'a sentence with a price is never the description')
  assert.equal(pinnedCopy(brief({ items }), { lang: 'en', dishes: 1 }).dishes.length, 1)
})

test('a dish name the body repeats at its start is still a dish; a caption sentence used as the title is not', () => {
  const items = [
    dish(1, { title: 'Duck Salad', body: 'Duck Salad with herbs from our garden.' }),
    dish(2, { title: 'Good coffee makes a difference', body: 'Good coffee makes a difference. Come by.' }),
    dish(3, {
      title: 'Our pork belly is slow cooked for…',
      body: 'Our pork belly is slow cooked for twelve hours and served with rice.'
    })
  ]
  const p = pinnedCopy(brief({ items }), { lang: 'en', dishes: 6 })
  assert.deepEqual(
    p.dishes.map((d) => d.value.name),
    ['Duck Salad']
  )
  assert.equal(p.dishes[0].value.description, 'Duck Salad with herbs from our garden.')
})

test('a caption read as the title is told apart whatever its case: a shouted first sentence is no dish name', () => {
  const items = [
    dish(1, { title: 'Chicken Salad Is Fresh', body: 'CHICKEN SALAD IS FRESH. Come visit us today.' }),
    dish(2, { title: 'Duck Salad', body: 'duck salad with herbs from our garden.' })
  ]
  const p = pinnedCopy(brief({ items }), { lang: 'en', dishes: 6 })
  assert.deepEqual(
    p.dishes.map((d) => d.value.name),
    ['Duck Salad']
  )
})

// Decided 24/10/2026: a price the menu prints shortened is written as the amount it means, in the site's language.
test('a shortened dish price is written as its full amount in the site language; a full or unknown one as printed', () => {
  const shot = { url: 'https://maps.test/menu.jpg', sha256: null, kind: 'photo' }
  const it = (name, price, priceScale, size) => ({
    name,
    price,
    size,
    currency: null,
    priceScale,
    section: 'S',
    source: shot,
    collectedAt: 'x',
    verified: false
  })
  const b = brief({ items: [story] })
  b.sitemap.push({
    slug: 'menu',
    sections: [
      {
        kind: 'menu',
        menuItems: [
          it('Rum', '110', 1000, '50ML'),
          it('Rum', '1485', 1000, '750ML'),
          it('Bibimbap', '1.2', 10000),
          it('Latte', '4.50', 1),
          it('Mojito', '120', null)
        ]
      }
    ]
  })
  const prices = (lang) =>
    pinnedCopy(b, { lang, dishes: 6 })
      .dishes.map((d) => d.value.price)
      .slice(0, 4)
  assert.deepEqual(prices('en'), ['50ML 110,000 · 750ML 1,485,000', '12,000', '4.50', '120'])
  assert.deepEqual(prices('vi')[0], '50ML 110.000 · 750ML 1.485.000')
})

test('collected menu items are the first dishes, verified ones first, each with its price as collected; one with no price is still a dish', () => {
  const src = { url: 'https://hill.test/menu.pdf', sha256: 'b'.repeat(64), kind: 'pdf', page: 1 }
  const shot = { url: 'https://maps.test/menu.jpg', sha256: null, kind: 'photo' }
  const it = (name, price, extra = {}) => ({
    name,
    price,
    currency: null,
    section: 'Mains',
    source: src,
    collectedAt: 'x',
    verified: true,
    ...extra
  })
  const b = brief({ items: [story, dish(1, { title: 'Duck Salad', body: 'Duck Salad with herbs.' })] })
  b.sitemap.push({
    slug: 'menu',
    sections: [
      {
        kind: 'menu',
        menuItems: [
          it('Shawarma plate', '38', { source: shot, verified: false, provenance: 'read from photo' }),
          it('Margherita', '8.50', { size: 'Small' }),
          it('Margherita', '12.00', { size: 'Large' }),
          it('Pho bo', '75.000'),
          it('Kofta', null, { source: shot, verified: false, priceConflict: true })
        ]
      }
    ]
  })
  const p = pinnedCopy(b, { lang: 'en', dishes: 6 })
  assert.deepEqual(
    p.dishes.map((d) => d.value),
    [
      { name: 'Margherita', description: '', price: 'Small 8.50 · Large 12.00' },
      { name: 'Pho bo', description: '', price: '75.000' },
      { name: 'Shawarma plate', description: '', price: '38' },
      { name: 'Kofta', description: '', price: '' },
      { name: 'Duck Salad', description: 'Duck Salad with herbs.' }
    ]
  )
  assert.equal(p.dishes[0].source, 'menu:https://hill.test/menu.pdf')
  assert.equal(p.dishes[2].source, 'menu:https://maps.test/menu.jpg')
  assert.equal(pinnedCopy(b, { lang: 'en', dishes: 1 }).dishes.length, 1)
})

test('contact facts: a WhatsApp number from the brief and the areas served, each with the field it came from', () => {
  const contact = pinnedCopy({
    business: {
      name: 'Harbour Sport Club',
      phone: '+971 50 000 1234',
      address: 'Al Barsha, Dubai',
      serviceAreas: [
        { text: 'Locations across Dubai', quote: 'Locations across Dubai', source: 'instagram:post:1' },
        { text: 'Al Barsha', quote: 'Al Barsha', source: 'instagram:post:2' }
      ]
    },
    contact: { whatsapp: { number: '+971 50 000 1234', verified: false, basis: 'uae-mobile' } }
  }).contact
  assert.deepEqual(contact.whatsapp, { value: '+971 50 000 1234', source: 'contact.whatsapp' })
  assert.deepEqual(contact.serviceArea, {
    value: 'Locations across Dubai; Al Barsha',
    source: 'business.serviceAreas'
  })
  // The address stays the address: the areas never take its place.
  assert.deepEqual(contact.address, { value: 'Al Barsha, Dubai', source: 'business.address' })
})

test('contact facts: no WhatsApp number and no areas served, no such facts', () => {
  const contact = pinnedCopy({
    business: { name: 'Fern Station', phone: '+84 235 5550 188', serviceAreas: [] },
    contact: { whatsapp: { number: 'call us', verified: false, basis: 'source' } }
  }).contact
  assert.equal(contact.whatsapp, undefined)
  assert.equal(contact.serviceArea, undefined)
})
