import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractCopyPins, slotRolesFor } from '../domain/contract-copy-pins.mjs'
import { forbiddenFillerText } from '../domain/slot-fill-manifest.mjs'

const slot = (key, type = 'text', maxCharacters = 80) => ({ key, type, maxCharacters, sample: 'demo' })
const contentMap = {
  slots: [
    slot('hero.title'),
    slot('hero.lead', 'text', 40),
    slot('hero.btn'),
    slot('hero.btn.url', 'url', 2048),
    slot('about.heading'),
    slot('about.text', 'text', 300),
    slot('card.1.title'),
    slot('card.1.text'),
    slot('card.2.title'),
    slot('card.2.text')
  ]
}
const map = {
  roles: {
    'hero.title': [{ text: 'hero.title' }],
    'hero.lead': [{ text: 'hero.lead' }],
    'hero.cta': [{ label: 'hero.btn', href: 'hero.btn.url' }],
    'about.story': [{ title: 'about.heading', text: 'about.text' }],
    cards: [
      { title: 'card.1.title', text: 'card.1.text' },
      { title: 'card.2.title', text: 'card.2.text' }
    ]
  }
}
const pinned = {
  'hero.title': { value: 'The Larch House', source: 'business.name' },
  'hero.cta': { value: { label: 'Call', href: 'tel:+84 235 0000.102' }, source: 'business.phone' },
  'about.story': {
    value: { title: 'The Blue Door', text: 'We opened in Sapa in 2015.' },
    source: 'post:facebook:1'
  },
  cards: [
    { value: { title: 'Pho <special>', text: 'Slow cooked {six} hours.' }, source: 'post:instagram:1' }
  ],
  contact: { phone: { value: '+84 235', source: 'business.phone' } }
}

test('each sourced role lands on its slots, with its source beside it', () => {
  const { pins, sources } = contractCopyPins({ map, contentMap, pinned })
  assert.equal(pins['hero.title'], 'The Larch House')
  assert.deepEqual([pins['hero.btn'], pins['hero.btn.url']], ['Call', 'tel:+842350000102'])
  assert.deepEqual(
    [pins['about.heading'], pins['about.text']],
    ['The Blue Door', 'We opened in Sapa in 2015.']
  )
  assert.equal(sources['about.text'], 'post:facebook:1')
  assert.equal(sources['hero.btn.url'], 'business.phone')
})

test('a role with no sourced value writes nothing; contact is never a slot here', () => {
  const { pins } = contractCopyPins({ map, contentMap, pinned })
  assert.equal('hero.lead' in pins, false)
  assert.equal(Object.values(pins).includes('+84 235'), false)
})

test('cards fill in order, as many as there are dishes; markup and directives never reach the site', () => {
  const { pins } = contractCopyPins({ map, contentMap, pinned })
  assert.equal(pins['card.1.title'], 'Pho special')
  assert.equal(pins['card.1.text'], 'Slow cooked (six) hours.')
  assert.equal('card.2.title' in pins, false)
})

test('a value longer than its slot is cut at a word', () => {
  const long = {
    'hero.lead': {
      value: 'A Highland kitchen and wine bar in the old town of Hoi An.',
      source: 'profile.bio'
    }
  }
  const { pins } = contractCopyPins({ map, contentMap, pinned: long })
  assert.equal(pins['hero.lead'], 'A Highland kitchen and wine bar in the…')
  assert.ok([...pins['hero.lead']].length <= 40)
})

test('a slot missing from this release skips its whole group, and says so', () => {
  const older = { slots: contentMap.slots.filter((s) => s.key !== 'about.text') }
  const { pins, skipped } = contractCopyPins({ map, contentMap: older, pinned })
  assert.equal('about.heading' in pins, false)
  assert.deepEqual(
    skipped.find((s) => s.role === 'about.story'),
    { role: 'about.story', reason: 'about.text is not in this release' }
  )
})

test('a slot of another kind than the field wants skips the group', () => {
  const swapped = {
    slots: contentMap.slots.map((s) => (s.key === 'hero.btn.url' ? { ...s, type: 'text' } : s))
  }
  const { pins, skipped } = contractCopyPins({ map, contentMap: swapped, pinned })
  assert.equal('hero.btn' in pins, false)
  assert.match(skipped.find((s) => s.role === 'hero.cta').reason, /hero\.btn\.url/)
})

test('a link the site would refuse takes its label with it', () => {
  const bad = {
    ...pinned,
    'hero.cta': { value: { label: 'Book', href: 'javascript:alert(1)' }, source: 'business.booking' }
  }
  const { pins, skipped } = contractCopyPins({ map, contentMap, pinned: bad })
  assert.equal('hero.btn' in pins, false)
  assert.equal('hero.btn.url' in pins, false)
  assert.ok(skipped.some((s) => s.role === 'hero.cta'))
})

test('a card without words of its own is left to the template', () => {
  const thin = { cards: [{ value: { title: 'Pho', text: '' }, source: 'post:instagram:1' }] }
  const { pins, skipped } = contractCopyPins({ map, contentMap, pinned: thin })
  assert.deepEqual(pins, {})
  assert.ok(skipped.some((s) => s.role === 'cards[0]'))
})

test('every hero variant a template carries is written', () => {
  const twice = { roles: { 'hero.title': [{ text: 'hero.title' }, { text: 'about.heading' }] } }
  const { pins } = contractCopyPins({ map: twice, contentMap, pinned })
  assert.deepEqual(pins, { 'hero.title': 'The Larch House', 'about.heading': 'The Larch House' })
})

test('the slot maps name both Tracy templates for Joomla and WordPress, and nothing else', () => {
  for (const cms of ['joomla', 'wordpress']) {
    for (const template of ['tracy-base', 'tracy-business'])
      assert.ok(slotRolesFor(cms, template)?.roles, `${cms} ${template}`)
    assert.equal(slotRolesFor(cms, 'ja-kinetic'), null)
  }
  assert.equal(slotRolesFor('emdash', 'tracy-base'), null)
})

const menuMap = {
  entities: [{ key: 'page-home', identity: { slug: 'home' } }],
  slots: [1, 2, 3]
    .flatMap((n) => [
      { ...slot(`home.dish-name.${n}`), entity: 'page-home', target: { block: `dish-name.${n}` } },
      { ...slot(`home.dish-text.${n}`), entity: 'page-home', target: { block: `dish-text.${n}` } },
      { ...slot(`home.dish-price.${n}`), entity: 'page-home', target: { block: `dish-price.${n}` } }
    ])
    .concat([{ ...slot('home.quote'), entity: 'page-home', target: { block: 'quote' } }])
}
const menuRoles = {
  roles: {
    dishes: [1, 2, 3].map((n) => ({
      name: `home.dish-name.${n}`,
      description: `home.dish-text.${n}`,
      price: `home.dish-price.${n}`,
      $item: `item.${n}`
    }))
  },
  placeholders: [
    {
      page: 'home',
      block: 'quotes',
      nth: 1,
      up: 1,
      unless: 'testimonials',
      why: 'demo testimonials',
      slots: ['home.quote']
    }
  ]
}

// 🔒 Replace, never remove (product owner, 22/10/2026): hiding what had no source emptied the JA Restaurant WP demo.
// 🔒 No filler (plan §7, 26/10/2026): "Coming soon" and the neutral dish names are gone; empty or "Menu item" instead.
test('dishes fill the menu in order; a dish item with no dish takes "Menu item", an empty body and an empty price', () => {
  const dishes = [
    { value: { name: 'Cao lau', description: 'Noodles of Hoi An.' }, source: 'post:facebook:2' }
  ]
  const out = contractCopyPins({ map: menuRoles, contentMap: menuMap, pinned: { dishes } })
  assert.equal(out.hidden, undefined)
  assert.deepEqual(out.pins, {
    'home.dish-name.1': 'Cao lau',
    'home.dish-text.1': 'Noodles of Hoi An.',
    'home.dish-price.1': '',
    'home.dish-name.2': 'Menu item',
    'home.dish-text.2': '',
    'home.dish-price.2': '',
    'home.dish-name.3': 'Menu item',
    'home.dish-text.3': '',
    'home.dish-price.3': '',
    'home.quote': ''
  })
  assert.equal(out.sources['home.dish-name.1'], 'post:facebook:2')
  assert.equal(out.sources['home.dish-price.1'], 'placeholder')
  assert.deepEqual(out.skipped, [])
  assert.deepEqual(
    out.placeholders.sort(),
    Object.keys(out.pins)
      .filter((k) => !k.endsWith('.1') || /price/.test(k))
      .sort()
  )
  assert.deepEqual(out.dishes, [{ name: 'Cao lau', description: 'Noodles of Hoi An.', price: '' }])
})

test('a dish without a name is never written: its item takes the neutral name instead', () => {
  const dishes = [{ value: { name: '', description: 'Noodles.' }, source: 'post:facebook:2' }]
  const {
    pins,
    skipped,
    dishes: written
  } = contractCopyPins({ map: menuRoles, contentMap: menuMap, pinned: { dishes } })
  assert.equal(skipped[0].role, 'dishes[0]')
  assert.equal(pins['home.dish-name.1'], 'Menu item')
  assert.equal(pins['home.dish-text.1'], '')
  assert.equal(pins['home.dish-price.1'], '')
  assert.deepEqual(written, [])
})

test('a sourced dish with no description or price: both are empty', () => {
  const dishes = [{ value: { name: 'Cao lau' }, source: 'post:facebook:2' }]
  const out = contractCopyPins({ map: menuRoles, contentMap: menuMap, pinned: { dishes } })
  assert.equal(out.pins['home.dish-name.1'], 'Cao lau')
  assert.equal(out.pins['home.dish-text.1'], '')
  assert.equal(out.pins['home.dish-price.1'], '')
  assert.deepEqual(out.dishes, [{ name: 'Cao lau', description: '', price: '' }])
})

test('a section of the template with placeholders "unless" a role is written takes the role\'s words once it is', () => {
  const map = { ...menuRoles, roles: { ...menuRoles.roles, testimonials: [{ text: 'home.quote' }] } }
  const { pins, sources } = contractCopyPins({
    map,
    contentMap: menuMap,
    pinned: { testimonials: { value: 'Lovely.', source: 'review:1' } }
  })
  assert.equal(pins['home.quote'], 'Lovely.')
  assert.equal(sources['home.quote'], 'review:1')
})

test('a menu on two pages: each page role takes the same dishes, each keeps the items it has no dish for', () => {
  const two = {
    entities: [
      { key: 'page-home', identity: { slug: 'home' } },
      { key: 'page-menu', identity: { slug: 'menu' } }
    ],
    slots: ['home', 'menu'].flatMap((page) =>
      [1, 2].flatMap((n) => [
        { ...slot(`${page}.name.${n}`), entity: `page-${page}`, target: { block: `name.${n}` } },
        { ...slot(`${page}.price.${n}`), entity: `page-${page}`, target: { block: `price.${n}` } },
        { ...slot(`${page}.badge.${n}`), entity: `page-${page}`, target: { block: `badge.${n}` } }
      ])
    )
  }
  const group = (page, n) => ({
    name: `${page}.name.${n}`,
    price: `${page}.price.${n}`,
    badge: `${page}.badge.${n}`,
    $item: `item.${n}`
  })
  const roles = {
    roles: {
      dishes: [group('home', 1), group('home', 2)],
      'dishes:menu': [group('menu', 1), group('menu', 2)]
    }
  }
  const dishes = [{ value: { name: 'Duck Salad' }, source: 'post:facebook:1' }]
  const { pins } = contractCopyPins({ map: roles, contentMap: two, pinned: { dishes } })
  for (const page of ['home', 'menu']) {
    assert.equal(pins[`${page}.name.1`], 'Duck Salad')
    assert.equal(pins[`${page}.price.1`], '')
    // A badge is never collected: empty on every dish item, sourced or not.
    assert.equal(pins[`${page}.badge.1`], '')
    assert.equal(pins[`${page}.badge.2`], '')
    assert.equal(pins[`${page}.name.2`], 'Menu item')
    assert.equal(pins[`${page}.price.2`], '')
  }
})

test('demo facts outside the slots: a collected fact is a line with its source and link, none collected hides the block', () => {
  const map = {
    roles: {},
    facts: [
      {
        part: 'footer',
        block: 'footer.contact',
        lines: [
          { fact: 'phone', label: 'Phone:', link: 'tel' },
          { fact: 'email', label: 'Email:', link: 'mailto' }
        ]
      },
      { part: 'footer', block: 'footer.hours', lines: [{ fact: 'hours' }] },
      { page: 'home', block: 'hero.address', lines: [{ fact: 'address', link: 'maps' }] }
    ]
  }
  const contact = {
    phone: { value: '+84 235 0000 102', source: 'business.phone' },
    hours: { value: 'Mon–Fri 07:00–22:00; Sat–Sun 08:00–23:00', source: 'business.hours' }
  }
  const { facts } = contractCopyPins({ map, contentMap, pinned: { contact } })
  assert.deepEqual(facts[0], {
    part: 'footer',
    block: 'footer.contact',
    nth: 1,
    lines: [
      { label: 'Phone:', text: '+84 235 0000 102', href: 'tel:+842350000102', source: 'business.phone' }
    ]
  })
  assert.deepEqual(
    facts[1].lines.map((l) => l.text),
    ['Mon–Fri 07:00–22:00', 'Sat–Sun 08:00–23:00']
  )
  assert.deepEqual(facts[2], { page: 'home', block: 'hero.address', nth: 1, lines: null })
})

test('a section of demo dishes no role reaches: the neutral name, empty bodies, badges and prices', () => {
  const keys = [1, 2].flatMap((n) => [
    `specials.list.dish-name.${n}`,
    `specials.list.dish-description.${n}`,
    `specials.list.dish-price.${n}`,
    `specials.list.dish-extra-class.${n}`
  ])
  const map = { roles: {}, placeholders: [{ page: 'home', block: 'specials', slots: keys }] }
  const { pins } = contractCopyPins({ map, contentMap: { slots: keys.map((key) => slot(key)) }, pinned: {} })
  assert.deepEqual(pins, {
    'specials.list.dish-name.1': 'Menu item',
    'specials.list.dish-description.1': '',
    'specials.list.dish-price.1': '',
    'specials.list.dish-extra-class.1': '',
    'specials.list.dish-name.2': 'Menu item',
    'specials.list.dish-description.2': '',
    'specials.list.dish-price.2': '',
    'specials.list.dish-extra-class.2': ''
  })
})

test('a dish item with no dish takes the neutral name in the site language, and no filler in any field', () => {
  const vi = JSON.parse(readFileSync(new URL('../domain/neutral-copy/vi.json', import.meta.url), 'utf8'))
  assert.notEqual(vi['neutral.offering.menu_item'], 'Menu item')
  for (const [locale, name] of [
    ['en', 'Menu item'],
    ['vi', vi['neutral.offering.menu_item']]
  ]) {
    const out = contractCopyPins({ map: menuRoles, contentMap: menuMap, pinned: {}, locale })
    assert.equal(out.pins['home.dish-name.1'], name, locale)
    for (const [key, value] of Object.entries(out.pins))
      assert.equal(forbiddenFillerText(value), false, `${locale} ${key}: ${value}`)
  }
})

test('without a sidecar, a gym’s item with no source is a Service and a Vietnamese spa’s the vi Service word, never a Menu item', () => {
  const map = { roles: { dishes: [{ $item: 'menu.item.1', name: 'n1', price: 'p1' }] } }
  const contentMap = {
    slots: [
      { key: 'n1', type: 'text', maxCharacters: 40 },
      { key: 'p1', type: 'text', maxCharacters: 20 }
    ]
  }
  const gym = contractCopyPins({ map, contentMap, pinned: {}, kind: 'service' })
  assert.equal(gym.pins.n1, 'Service')
  const spa = contractCopyPins({ map, contentMap, pinned: {}, kind: 'service', locale: 'vi' })
  const vi = JSON.parse(readFileSync(new URL('../domain/neutral-copy/vi.json', import.meta.url), 'utf8'))[
    'neutral.offering.service'
  ]
  assert.notEqual(vi, 'Service')
  assert.equal(spa.pins.n1, vi)
  assert.equal(contractCopyPins({ map, contentMap, pinned: {} }).pins.n1, 'Menu item')
})

test('demo facts outside the slots: a WhatsApp line links to wa.me, the areas served are a plain line', () => {
  const map = {
    roles: {},
    facts: [
      {
        part: 'footer',
        block: 'footer.contact',
        lines: [
          { fact: 'phone', label: 'Phone:', link: 'tel' },
          { fact: 'whatsapp', label: 'WhatsApp:', link: 'whatsapp' }
        ]
      },
      { part: 'footer', block: 'footer.location', lines: [{ fact: 'serviceArea', label: 'Serving:' }] }
    ]
  }
  const contact = {
    phone: { value: '+971 50 000 1234', source: 'business.phone' },
    whatsapp: { value: '+971 50 000 1234', source: 'contact.whatsapp' },
    serviceArea: { value: 'Locations across Dubai', source: 'business.serviceAreas' }
  }
  const { facts } = contractCopyPins({ map, contentMap, pinned: { contact } })
  assert.deepEqual(facts[0].lines[1], {
    label: 'WhatsApp:',
    text: '+971 50 000 1234',
    href: 'https://wa.me/971500001234',
    source: 'contact.whatsapp'
  })
  assert.deepEqual(facts[1].lines, [
    { label: 'Serving:', text: 'Locations across Dubai', source: 'business.serviceAreas' }
  ])
})
