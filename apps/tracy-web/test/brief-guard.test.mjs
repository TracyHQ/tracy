/** The facts a model may not put on a customer's site on its own — proven by comparing strings with the customer's words. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  factsOf,
  guardChanges,
  guardWritten,
  isNetworkName,
  isPlaceholder,
  ungrounded
} from '../src/sites/brief-engines/guard.js'

const said = factsOf(
  'Golden Crust Bakery, 12 Hang Gai Street, Hanoi. Call +84 24 3555 0144 or hello@goldencrust.vn. Baking since 2009. Cakes from 50,000 VND.'
)
const nothing = factsOf('A family bakery in Hanoi')

test('a phone number the customer gave passes, one they did not is refused', () => {
  assert.equal(ungrounded('Hotline: +84 24 3555 0144', 'Hotline: 8 800 550-67-90', said), null)
  assert.equal(
    ungrounded('Hotline: 0243 555 0144', 'x', said),
    'phone number not given',
    'a different number'
  )
  assert.equal(
    ungrounded('Hotline: +84 24 3555 0144', 'Hotline: 8 800 550-67-90', nothing),
    'phone number not given'
  )
  // The demo's own number, left in a slot, is the template company's fact: not evidence for this customer (L09).
  assert.match(
    ungrounded('Hotline: 8 800 550-67-90', 'Hotline: 8 800 550-67-90', nothing),
    /^phone number not given/
  )
})

// 🔒 A FACT EQUAL TO THE TEMPLATE'S OWN SAMPLE IS NOT EVIDENCE; ONLY THE BRIEF'S FACTS COUNT (ledger L09). A line rewritten
// around the demo's hotline or mailbox used to pass because the slot's sample carried it, and the customer's site kept another
// company's contact details under its own words.
test('a fact the slot’s own sample carries is not evidence: only what the customer said is', () => {
  const clinic = factsOf(
    'Bright Smile Dental, Ostrava. Call +420 596 555 012 or desk@brightsmile.example.cz.'
  )
  const sample =
    'Call +7 495 555-01-00 or write to sales@northgate-ind.ru, 14 Volga Street. From $250. Since 1998.'
  for (const [value, reason] of [
    ['Call our team on +7 495 555-01-00', /^phone number not given/],
    ['Write to sales@northgate-ind.ru', /^email address not given/],
    ['Visit us at 14 Volga Street', /^street address not given/],
    ['Check-ups from $250', /^price not given/],
    ['Caring for smiles since 1998', /^year not given/]
  ])
    assert.match(String(ungrounded(value, sample, clinic)), reason, value)
  // The customer's own facts pass, whatever the sample says.
  assert.equal(ungrounded('Call +420 596 555 012', sample, clinic), null)
  assert.equal(ungrounded('Write to desk@brightsmile.example.cz', sample, clinic), null)
  // And guardChanges drops such a line the same way.
  const { kept, dropped } = guardChanges(
    { a: 'Call our team on +7 495 555-01-00', b: 'Gentle care for the whole family' },
    new Map([
      ['a', { sample }],
      ['b', { sample }]
    ]),
    clinic
  )
  assert.deepEqual(Object.keys(kept), ['b'])
  assert.deepEqual(
    dropped.map((d) => d.key),
    ['a']
  )
})

test('a range of years or a numeric date is not a phone number', () => {
  for (const value of ['Issue 2025-2026', 'Updated 2026-10-03', 'Dated 03/10/2026'])
    assert.equal(ungrounded(value, '', nothing), null, value)
})

test('an email is checked the same way, and a placeholder in an email template is not a fact', () => {
  assert.equal(ungrounded('Write to hello@goldencrust.vn', '', said), null)
  assert.equal(ungrounded('Write to sales@goldencrust.vn', '', said), 'email address not given')
  assert.equal(ungrounded('To: you@example.com', '', nothing), null)
})

test('a street address, a price and a year need the customer to have said them', () => {
  assert.equal(ungrounded('Visit 12 Hang Gai Street', '', said), null)
  assert.equal(ungrounded('Visit 45 Linh Lang Street', '', said), 'street address not given')
  assert.equal(ungrounded('Cakes from 50,000 VND', '', said), null)
  assert.equal(ungrounded('Cakes from 99,000 VND', '', said), 'price not given')
  assert.equal(ungrounded('Baking since 2009', '', said), null)
  assert.equal(ungrounded('Baking since 2010', '', said), 'year not given')
  assert.match(
    String(ungrounded('Founded in 2005', 'Founded in 2005', nothing)),
    /^year not given/,
    'a year already in the slot is the template’s, not the customer’s'
  )
})

test('the year of the day and its neighbours are what a copyright line carries', () => {
  const now = new Date().getUTCFullYear()
  assert.equal(ungrounded(`© ${now} Golden Crust`, '', nothing), null)
  assert.equal(ungrounded(`Updated ${now - 1}`, '', nothing), null)
  assert.equal(ungrounded(`Since ${now - 15}`, '', nothing), 'year not given')
})

test('ordinary copy passes untouched', () => {
  for (const value of [
    'Fresh bread baked every morning',
    'Order online for same-day pick-up',
    '3 ways to order',
    'Open 7 days'
  ])
    assert.equal(ungrounded(value, '', nothing), null, value)
})

test('guardChanges keeps what is clean and names what it drops', () => {
  const slots = new Map([
    ['a', { sample: 'x' }],
    ['b', { sample: 'y' }],
    ['c', { sample: 'z' }]
  ])
  const { kept, dropped } = guardChanges(
    { a: 'Fresh bread', b: 'Call +84 24 3555 0144', c: 'Since 2001' },
    slots,
    nothing
  )
  assert.deepEqual(kept, { a: 'Fresh bread' })
  assert.deepEqual(dropped, [
    { key: 'b', reason: 'phone number not given' },
    { key: 'c', reason: 'year not given' }
  ])
})

test('the guard is not English-only: addresses, prices and web addresses the customer did not give are refused', async () => {
  const { factsOf, ungrounded } = await import('../src/sites/brief-engines/guard.js')
  const facts = factsOf('We bake bread')
  for (const value of [
    '12 Hauptstraße',
    'Hauptstraße 12',
    '12 rue de la Paix',
    'Calle Mayor 5',
    '123 Nguyễn Trãi, Quận 1',
    '50 dollars',
    '50 nghìn đồng',
    'https://best-bakery.test/shop',
    'www.best-bakery.test'
  ])
    assert.ok(ungrounded(value, '', facts), `${value} must be refused`)
  const own = factsOf('We are at 12 rue de la Paix, www.best-bakery.test, bread from 50 dollars')
  for (const value of ['12 rue de la Paix', 'https://www.best-bakery.test/shop', 'from 50 dollars'])
    assert.equal(ungrounded(value, '', own), null, `${value} is the customer's own`)
  assert.equal(ungrounded('Baked daily', '', facts), null)
})

// 🔒 A SOCIAL OR ICON LINK'S NAME IS NOT THE BUSINESS'S WORDS, AND A PLACEHOLDER IS NOT WORDS (sq-check mod-lad1..8, 13–14/10/2026).
// The slots below are shaped like the ones the rule was measured on, and the rule reads only their shape: JA Mood j6 1.0.2's
// Social List (`<a href="#" title="Facebook"><span class="fa …"></span><span class="element-invisible">empty</span></a>`, ×4),
// JA Essence's JSON social item (`social-intro[title]` beside `social-intro[link]`), an icon link that is no social network's,
// a link with words of its own, a heading, a paragraph and a page break's title.
const li = (n) => `/html/body/div/ul/li[${n}]/a`
const socialList = ['Facebook', 'Twitter', 'Instagram', 'Google plus'].flatMap((name, i) => [
  {
    key: `module-89.${3 * i}`,
    entity: 'module-89',
    column: 'content',
    type: 'url',
    sample: '#',
    xpath: `${li(i + 1)}/@href`,
    label: 'Social List'
  },
  {
    key: `module-89.${3 * i + 1}`,
    entity: 'module-89',
    column: 'content',
    type: 'text',
    sample: name,
    xpath: `${li(i + 1)}/@title`,
    label: 'Social List'
  },
  {
    key: `module-89.${3 * i + 2}`,
    entity: 'module-89',
    column: 'content',
    type: 'text',
    sample: 'empty',
    xpath: `${li(i + 1)}/span[2]/text()`,
    label: 'Social List'
  }
])
const json = (field, i) => ['social', `social-intro[${field}]`, i]
const shapes = [
  ...socialList,
  {
    key: 'module-125.0',
    entity: 'module-125',
    column: 'params',
    nestedJson: 'jatools-config',
    type: 'text',
    sample: 'Facebook',
    jsonPath: json('title', 0),
    label: 'Social / title'
  },
  {
    key: 'module-125.1',
    entity: 'module-125',
    column: 'params',
    nestedJson: 'jatools-config',
    type: 'text',
    sample: 'Rss',
    jsonPath: json('title', 1),
    label: 'Social / title'
  },
  {
    key: 'module-125.2',
    entity: 'module-125',
    column: 'params',
    nestedJson: 'jatools-config',
    type: 'url',
    sample: '#',
    jsonPath: json('link', 0),
    label: 'Social / link'
  },
  {
    key: 'module-125.3',
    entity: 'module-125',
    column: 'params',
    nestedJson: 'jatools-config',
    type: 'url',
    sample: '#',
    jsonPath: json('link', 1),
    label: 'Social / link'
  },
  // An icon that is no network's: a search link drawn as a glyph, named only by its title.
  {
    key: 'module-90.0',
    entity: 'module-90',
    column: 'content',
    type: 'url',
    sample: '/search',
    xpath: '/html/body/div/a/@href',
    label: 'Header tools'
  },
  {
    key: 'module-90.1',
    entity: 'module-90',
    column: 'content',
    type: 'text',
    sample: 'Search',
    xpath: '/html/body/div/a/@title',
    label: 'Header tools'
  },
  // A picture link (a footer logo): its title names the template's company, and the brief may rewrite it.
  {
    key: 'module-124.0',
    entity: 'module-124',
    column: 'content',
    type: 'url',
    sample: 'index.php',
    xpath: '/html/body/div/a/@href',
    label: 'Footer Logo'
  },
  {
    key: 'module-124.1',
    entity: 'module-124',
    column: 'content',
    type: 'text',
    sample: 'Bravada Studio',
    xpath: '/html/body/div/a/@title',
    label: 'Footer Logo'
  },
  {
    key: 'module-124.2',
    entity: 'module-124',
    column: 'content',
    type: 'image',
    sample: 'images/logo.png',
    xpath: '/html/body/div/a/img/@src',
    label: 'Footer Logo'
  },
  // A link with words of its own: its title is a line like the others.
  {
    key: 'module-91.0',
    entity: 'module-91',
    column: 'content',
    type: 'url',
    sample: '/about',
    xpath: '/html/body/div/a/@href',
    label: 'Intro'
  },
  {
    key: 'module-91.1',
    entity: 'module-91',
    column: 'content',
    type: 'text',
    sample: 'About our studio',
    xpath: '/html/body/div/a/@title',
    label: 'Intro'
  },
  {
    key: 'module-91.2',
    entity: 'module-91',
    column: 'content',
    type: 'text',
    sample: 'About us',
    xpath: '/html/body/div/a/text()',
    label: 'Intro'
  },
  {
    key: 'module-100.0',
    entity: 'module-100',
    column: 'content',
    type: 'text',
    sample: 'Fresh every morning',
    xpath: '/html/body/div/h2/text()',
    label: 'Welcome'
  },
  {
    key: 'module-100.1',
    entity: 'module-100',
    column: 'content',
    type: 'text',
    sample: 'Our story began in a small kitchen.',
    xpath: '/html/body/div/p[1]/text()',
    label: 'Welcome'
  },
  {
    key: 'module-100.2',
    entity: 'module-100',
    column: 'content',
    type: 'text',
    sample: 'Read more',
    xpath: '/html/body/div/p[2]/text()',
    label: 'Welcome'
  },
  // A page break's title is no link's: it is the name of a page of the article.
  {
    key: 'article-3.6',
    entity: 'article-3',
    column: 'introtext',
    type: 'text',
    sample: 'Resistance is Futile',
    xpath: '/html/body/div/hr[1]/@title',
    label: 'What Do You Mean?'
  }
].map((slot) => ({ ...slot, current: slot.sample }))
const shapeOf = new Map(shapes.map((slot) => [slot.key, slot]))
const bakery = factsOf(
  'Tiệm bánh gia đình ở Dubai, nướng bánh mì sourdough và bánh mì Việt mỗi sáng, không chất bảo quản.'
)

test('the plan never writes the business’s words into a social or icon link’s name, nor a placeholder into any line', () => {
  const { kept, dropped, held } = guardChanges(
    {
      // What the model wrote on the stand.
      'module-89.1': 'Bánh mì Việt',
      'module-89.2': 'trống',
      'module-89.4': 'Instagram',
      'module-89.5': 'trống',
      'module-89.7': 'Chưa có mạng xã hội',
      'module-89.8': 'Bánh mì sourdough',
      'module-89.10': 'Tiệm bánh gia đình',
      'module-89.11': 'trống',
      'module-125.0': 'Kênh của tiệm',
      'module-125.1': 'Nguồn cấp dữ liệu',
      'module-90.1': 'Bánh mì sourdough',
      'module-100.1': 'N/A',
      'module-100.2': '—',
      // The business's words where they belong: a picture link's title names the business, not the template's company.
      'module-124.1': 'Tiệm Bánh Tamarind',
      'module-91.1': 'Về tiệm bánh gia đình',
      'module-91.2': 'Về chúng tôi',
      'module-100.0': 'Bánh mì Việt nướng mỗi sáng',
      'article-3.6': 'Bánh mì mỗi sáng'
    },
    shapeOf,
    bakery
  )
  assert.deepEqual(kept, {
    'module-124.1': 'Tiệm Bánh Tamarind',
    'module-91.1': 'Về tiệm bánh gia đình',
    'module-91.2': 'Về chúng tôi',
    'module-100.0': 'Bánh mì Việt nướng mỗi sáng',
    'article-3.6': 'Bánh mì mỗi sáng'
  })
  // Nothing here states a fact, so nothing is offered a second asking: these lines keep what they hold.
  assert.deepEqual(dropped, [])
  const why = Object.fromEntries(held.map((h) => [h.key, h.reason]))
  for (const key of [
    'module-89.1',
    'module-89.4',
    'module-89.7',
    'module-89.10',
    'module-125.0',
    'module-125.1'
  ])
    assert.match(why[key], /social network’s name/, key)
  for (const key of ['module-89.2', 'module-89.5', 'module-89.8', 'module-89.11'])
    assert.match(why[key], /template leaves this line empty/, key)
  assert.match(why['module-90.1'], /social or icon link/)
  assert.match(why['module-100.1'], /placeholder/)
  assert.match(why['module-100.2'], /placeholder/)
})

test('the last look keeps a network’s name and a blank line as they are, and lets an icon’s own name be translated', () => {
  const { kept, held } = guardWritten(
    {
      // Translations of the template's own words, made after the plan.
      'module-89.10': 'Google cộng',
      'module-89.2': 'trống',
      'module-125.1': 'Nguồn cấp dữ liệu',
      'module-90.1': 'Tìm kiếm',
      'module-100.1': 'Không có',
      'module-100.2': 'Đọc thêm'
    },
    shapeOf,
    bakery
  )
  assert.deepEqual(kept, { 'module-90.1': 'Tìm kiếm', 'module-100.2': 'Đọc thêm' })
  assert.deepEqual(held.map((h) => h.key).sort(), [
    'module-100.1',
    'module-125.1',
    'module-89.10',
    'module-89.2'
  ])
})

test('a placeholder is told by its words in every language Tracy writes, and a word the customer used is theirs', () => {
  for (const value of [
    'trống',
    '(trống)',
    'Không có',
    'empty',
    'N/A',
    'n/a.',
    'leeg',
    'vide',
    'vacío',
    'vuoto',
    'keine',
    '暂无',
    '—',
    '...'
  ])
    assert.ok(isPlaceholder(value, 'Fresh every morning', bakery), value)
  for (const value of ['Bánh mì Việt', 'Leer', 'Todo', 'Na', 'Đọc thêm', ''])
    assert.equal(isPlaceholder(value, 'Read', bakery), false, value)
  // A drum shop's "Trống" (drums) is the customer's word, not a placeholder.
  assert.equal(isPlaceholder('Trống', 'Guitars', factsOf('Cửa hàng bán trống và kèn ở Huế')), false)
  // Marks are a placeholder only where the line held words.
  assert.equal(isPlaceholder('→', '→', bakery), false)
  const { kept } = guardChanges(
    { 'module-100.0': 'Trống' },
    shapeOf,
    factsOf('Cửa hàng bán trống và kèn ở Huế')
  )
  assert.deepEqual(kept, { 'module-100.0': 'Trống' })
  // A link is no line of words: "#" over an address takes the link off, and is no placeholder.
  assert.deepEqual(guardChanges({ 'module-90.0': '#' }, shapeOf, bakery).kept, { 'module-90.0': '#' })
})

test('a social network’s name is the whole value, never a sentence that mentions one', () => {
  for (const value of ['Facebook', 'facebook', 'Google plus', 'Google+', 'X (Twitter)', 'Rss', 'vimeo'])
    assert.ok(isNetworkName(value), value)
  for (const value of ['Follow us on Instagram', 'Bánh mì Việt', 'Kênh của tiệm', ''])
    assert.equal(isNetworkName(value), false, value)
})

test('an address slot never takes words, whatever its type says (JA Boxing link-btn, 25/10/2026)', () => {
  // The JA Boxing 1.0.4 contract types a pricing button's link as text: `features-intro[link-btn]`, sample "#".
  // A Vietnamese site wrote "Xem chi tiết" into four of them, so the buttons led to `/Xem chi tiết` (404).
  const slots = new Map(
    [
      {
        key: 'module-188.16',
        type: 'text',
        sample: '#',
        jsonPath: ['features-intro', 'features-intro[link-btn]', 0]
      },
      {
        key: 'module-188.12',
        type: 'text',
        sample: 'Select plan',
        jsonPath: ['features-intro', 'features-intro[title-btn]', 0]
      },
      { key: 'module-175.0', type: 'url', sample: '#', xpath: '/html/body/div/a[1]/@href' },
      { key: 'module-50.1', type: 'text', sample: '/index.php/contact', label: 'Footer / link' },
      { key: 'module-50.2', type: 'text', sample: 'https://example.com/pricing', label: 'Hero' },
      { key: 'module-50.3', type: 'text', sample: 'mailto:sale@getfit.com', label: 'Hero' },
      { key: 'module-50.4', type: 'image', sample: 'images/a.jpg', label: 'Hero' },
      { key: 'article-9.alias', type: 'text', sample: 'our-story', column: 'alias' }
    ].map((slot) => [slot.key, { entity: slot.key.split('.')[0], column: 'params', ...slot }])
  )
  const changes = {
    'module-188.16': 'Xem chi tiết',
    'module-188.12': 'Chọn gói',
    'module-175.0': 'Liên hệ',
    'module-50.1': 'Liên hệ với chúng tôi',
    'module-50.2': 'Bảng giá',
    'module-50.3': 'Gửi thư',
    'module-50.4': 'Ảnh đẹp',
    'article-9.alias': 'Câu chuyện của chúng tôi'
  }
  for (const guard of [guardWritten, guardChanges]) {
    const { kept, held } = guard(changes, slots, nothing)
    assert.deepEqual(kept, { 'module-188.12': 'Chọn gói' }, guard.name)
    for (const { reason } of held) assert.match(reason, /address/, guard.name)
  }
  // An address written as an address is still an address: the customer's own link passes.
  const { kept } = guardWritten(
    {
      'module-188.16': '/index.php/plans',
      'module-175.0': 'tel:+842435550144',
      'module-50.4': 'images/b.jpg'
    },
    slots,
    nothing
  )
  assert.deepEqual(Object.keys(kept).sort(), ['module-175.0', 'module-188.16', 'module-50.4'])
})

test('an e-mail or phone field takes an e-mail or a number as a visitor reads it, never a translated word', () => {
  const slots = new Map(
    [
      { key: 'module-60.1', type: 'text', sample: 'sale@getfit.com', jsonPath: ['email'] },
      { key: 'module-60.2', type: 'text', sample: '(239) 555-0108', jsonPath: ['phone'] }
    ].map((slot) => [slot.key, { entity: 'module-60', column: 'params', ...slot }])
  )
  const ok = guardWritten(
    { 'module-60.1': 'hello@saigoniron.vn', 'module-60.2': '+84 28 5555 0155' },
    slots,
    nothing
  )
  assert.deepEqual(Object.keys(ok.kept).sort(), ['module-60.1', 'module-60.2'])
  const bad = guardWritten(
    { 'module-60.1': 'Thư điện tử', 'module-60.2': 'Gọi cho chúng tôi' },
    slots,
    nothing
  )
  assert.deepEqual(bad.kept, {})
})
