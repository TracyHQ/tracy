import { strict as assert } from 'node:assert'
import test from 'node:test'
import { contactOf, isTokenOnly, resolveChromeSlots } from '../src/chrome-slots.mjs'

// tracy-business/j6 1.2.0 keeps the site's identity in ONE module (`[Tracy] Site identity`); every
// other place on the site says `{site.name}`, `{contact.phone}`… The seed writes that module and
// nothing else about identity. A fact the brief does not give is EMPTY, never the demo's value and
// never a pending key: the component (0.17.0+) lets an identity slot be emptied, and the page hides
// what is empty.
const CONTRACT = 'tracy-business/j6/1.2.0'
const identity = [
  ['module-4369.0', 'Northgate Industrial'],
  ['module-4369.1', 'Northgate Industrial JSC'],
  ['module-4369.2', 'Industrial infrastructure'],
  ['module-4369.3', 'NG'],
  ['module-4369.4', 'sales@northgate-ind.ru'],
  ['module-4369.5', '8 800 550-67-90'],
  ['module-4369.6', 'Vorsino Industrial Park, plot 12, Kaluga Region'],
  ['module-4369.7', 'Mon–Fri, 9:00–18:00 (MSK)'],
  ['module-4369.8', ''],
  ['module-4369.9', ''],
  ['module-4369.10', ''],
  ['module-4369.11', ''],
  ['module-4369.12', '']
].map(([key, sample]) => ({ key, sample, maxCharacters: 255, requiresEvidence: false }))

const NOW = new Date('2026-09-23T00:00:00Z')

test('the identity module takes the name, its mark, and the phone and address the brief gave', () => {
  const { values, pending } = resolveChromeSlots({
    contract: CONTRACT,
    slots: identity,
    site: { name: 'Ăn Hỏi Sarah & Co', contact: '12 Lê Lợi, Huế · Hotline: +84 905 123 456' },
    now: NOW
  })
  assert.deepEqual(pending, [])
  assert.deepEqual(values, {
    'module-4369.0': 'Ăn Hỏi Sarah & Co',
    'module-4369.1': '',
    'module-4369.2': '',
    'module-4369.3': 'ĂHS',
    'module-4369.4': '',
    'module-4369.5': '+84 905 123 456',
    'module-4369.6': '12 Lê Lợi, Huế',
    'module-4369.7': '',
    'module-4369.8': '',
    'module-4369.9': '',
    'module-4369.10': '',
    'module-4369.11': '',
    'module-4369.12': ''
  })
})

test('a brief without contact leaves phone and address empty rather than waiting on them', () => {
  const { values, pending } = resolveChromeSlots({
    contract: CONTRACT,
    slots: identity,
    site: { name: 'Sarah' },
    now: NOW
  })
  assert.deepEqual(pending, [])
  assert.equal(values['module-4369.5'], '')
  assert.equal(values['module-4369.6'], '')
})

// L32 (05/10/2026, benchjoomlaapply01): Apply's contact line is "phone · email · address". The
// email went into the address (`hello@goldencrust.example · 12 Hang Bac, Hanoi`) and the identity
// email stayed empty, so every `mailto:{contact.email}` link on the site was `mailto:` with no text;
// the opening hours and the profiles the customer gave were dropped the same way.
const GOLDEN_CRUST = {
  name: 'Golden Crust Bakery',
  contact: '0912 345 678 · hello@goldencrust.example · 12 Hang Bac, Hanoi',
  hours: 'Open 6am-8pm every day',
  social: { instagram: 'https://instagram.com/goldencrust', x: 'https://x.com/goldencrust' }
}

test('the identity module takes the email, the hours and the profiles the brief gave, each in its own field', () => {
  const { values, pending } = resolveChromeSlots({
    contract: CONTRACT,
    slots: identity,
    site: GOLDEN_CRUST,
    now: NOW
  })
  assert.deepEqual(pending, [])
  assert.equal(values['module-4369.4'], 'hello@goldencrust.example')
  assert.equal(values['module-4369.5'], '0912 345 678')
  assert.equal(values['module-4369.6'], '12 Hang Bac, Hanoi', 'the address holds no email')
  assert.equal(values['module-4369.7'], 'Open 6am-8pm every day')
  assert.equal(values['module-4369.9'], 'https://instagram.com/goldencrust')
  // A network the brief did not link, and one the identity has no field for (x), stay empty.
  for (const key of ['module-4369.8', 'module-4369.10', 'module-4369.11', 'module-4369.12'])
    assert.equal(values[key], '', key)
})

test('the contact line is read into a phone, an email and an address, whatever order it is in', () => {
  assert.deepEqual(contactOf({ contact: '0912 345 678 · hello@goldencrust.example · 12 Hang Bac, Hanoi' }), {
    phone: '0912 345 678',
    email: 'hello@goldencrust.example',
    address: '12 Hang Bac, Hanoi'
  })
  assert.deepEqual(contactOf({ contact: 'hello@goldencrust.example' }), {
    phone: null,
    email: 'hello@goldencrust.example',
    address: null
  })
  assert.deepEqual(contactOf({ contact: '12 Lê Lợi, Huế · Hotline: +84 905 123 456' }), {
    phone: '+84 905 123 456',
    email: null,
    address: '12 Lê Lợi, Huế'
  })
})

test('the phone, the email and the address Apply already read apart win over the line they were joined into', () => {
  // Apply's normaliser reads each fact out of the owner's text (`brief-normalize.js`) and joins them into `contact`; the
  // facts it read are the truth, and the line is only parsed for a brief that has nothing else (a Build brief).
  assert.deepEqual(
    contactOf({
      contact: '0912 345 678 · hello@goldencrust.example · Tầng 2, 12 Hàng Bạc',
      phone: '0912 345 678',
      email: 'hello@goldencrust.example',
      address: 'Tầng 2, 12 Hàng Bạc, Hà Nội'
    }),
    { phone: '0912 345 678', email: 'hello@goldencrust.example', address: 'Tầng 2, 12 Hàng Bạc, Hà Nội' }
  )
  // A fact Apply did not find is not looked for again in the line.
  assert.deepEqual(
    contactOf({ contact: 'hello@goldencrust.example · 0912 345 678', email: 'hello@goldencrust.example' }),
    {
      phone: null,
      email: 'hello@goldencrust.example',
      address: null
    }
  )
})

{
  // A Build brief's free line: every label goes with its value, every email and every extra number stay out of the
  // address, and the separators the customer typed stay as typed.
  const LINES = [
    [
      'Hotline: 0905 123 456, 12 Lê Lợi, Huế',
      { phone: '0905 123 456', email: null, address: '12 Lê Lợi, Huế' }
    ],
    [
      'Điện thoại: 0905 123 456, Địa chỉ: 12 Lê Lợi',
      { phone: '0905 123 456', email: null, address: '12 Lê Lợi' }
    ],
    ['info@a.com, sales@a.com · 12 Hang Bac', { phone: null, email: 'info@a.com', address: '12 Hang Bac' }],
    ['0905 123 456 ext. 89 · 12 Hang Bac', { phone: '0905 123 456', email: null, address: '12 Hang Bac' }],
    [
      '0905 123 456, 0236 3123 456 · 12 Hang Bac',
      { phone: '0905 123 456', email: null, address: '12 Hang Bac' }
    ],
    ['12 Hang Bac; Hanoi | Vietnam', { phone: null, email: null, address: '12 Hang Bac; Hanoi | Vietnam' }],
    [
      '12 Hang Bac · Email: hello@goldencrust.example · Hanoi',
      { phone: null, email: 'hello@goldencrust.example', address: '12 Hang Bac · Hanoi' }
    ],
    [
      'Address: Sunrise Hotel, 4 Tran Phu · Tel. +84 236 3 123 456',
      { phone: '+84 236 3 123 456', email: null, address: 'Sunrise Hotel, 4 Tran Phu' }
    ]
  ]
  for (const [contact, expected] of LINES)
    test(`a free contact line is read without leaving a label, an email or a second number in the address: ${contact}`, () => {
      assert.deepEqual(contactOf({ contact }), expected)
    })
}

test('a slot holding only identity tokens is chrome: the seed leaves it as it is', () => {
  for (const sample of ['{site.name}', 'tel:{contact.tel}', 'mailto:{contact.email}', ' {contact.phone} '])
    assert.equal(isTokenOnly(sample), true, sample)
  for (const sample of ['Why {site.name}', 'Hotline: {contact.phone}', '', 'plain', '{loadposition x}'])
    assert.equal(isTokenOnly(sample), false, sample)
})

test('the model never sees a token-only slot, and the customer name it writes becomes {site.name}', async () => {
  const { planJoomlaContract } = await import('../src/plan-joomla-contract.mjs')
  const seen = []
  const plan = await planJoomlaContract({
    state: {
      contract: CONTRACT,
      revision: 'r1',
      slots: [
        ...identity,
        { key: 'module-435.0', sample: '{site.monogram}', maxCharacters: 40, requiresEvidence: false },
        { key: 'module-444.0', sample: 'Why {site.name}', maxCharacters: 60, requiresEvidence: false }
      ]
    },
    site: { name: 'Ăn Hỏi Sarah' },
    now: NOW,
    generate: async ({ input }) => {
      seen.push(...input.slots.map((s) => s.key))
      return JSON.stringify({ values: { 'module-444.0': 'Why choose Ăn Hỏi Sarah' }, pending: [] })
    }
  })
  assert.deepEqual(seen, ['module-444.0'])
  assert.equal(plan.changes['module-444.0'], 'Why choose {site.name}')
  assert.equal(plan.changes['module-4369.0'], 'Ăn Hỏi Sarah')
  assert.equal('module-435.0' in plan.changes, false)
})

// L32 (05/10/2026, benchjoomlaapply01): a module the Claude Cowork plugin wrote into (`ContentSlots::htmlPatch`, PHP
// `saveHTML` on libxml2 2.9) comes back with every brace of a link percent-encoded — the Vietnamese top bar read
// `tel:%7Bcontact.tel%7D` and `mailto:%7Bcontact.email%7D`. That is still nothing but a token, in any letter case.
test('a token-only link the site stored percent-encoded is still chrome, in any letter case', () => {
  for (const sample of [
    'tel:%7Bcontact.tel%7D',
    'mailto:%7Bcontact.email%7D',
    'mailto:%7bcontact.email%7d',
    '%7Bsocial.facebook%7D',
    '%7Bsite.name%7D · {contact.phone}'
  ])
    assert.equal(isTokenOnly(sample), true, sample)
  for (const sample of [
    'Hotline: %7Bcontact.phone%7D',
    '%7Bloadposition x%7D',
    'tel:%7B0912%7D',
    '%7Bcontact.tel'
  ])
    assert.equal(isTokenOnly(sample), false, sample)
})

test('the model never sees a link that holds only a percent-encoded token, and it is not rewritten', async () => {
  const { planJoomlaContract } = await import('../src/plan-joomla-contract.mjs')
  const seen = []
  const plan = await planJoomlaContract({
    state: {
      contract: CONTRACT,
      revision: 'r1',
      slots: [
        ...identity,
        {
          key: 'module-428.0',
          type: 'url',
          sample: 'tel:{contact.tel}',
          current: 'tel:%7Bcontact.tel%7D',
          maxCharacters: 2048,
          requiresEvidence: false
        },
        { key: 'module-444.0', sample: 'Why {site.name}', maxCharacters: 60, requiresEvidence: false }
      ]
    },
    site: { name: 'Ăn Hỏi Sarah', contact: '0912 345 678' },
    now: NOW,
    generate: async ({ input }) => {
      seen.push(...input.slots.map((s) => s.key))
      return JSON.stringify({ values: { 'module-444.0': 'Why choose Ăn Hỏi Sarah' }, pending: [] })
    }
  })
  assert.deepEqual(seen, ['module-444.0'])
  assert.equal('module-428.0' in plan.changes, false)
})

// tracy-apple/j6 1.3.0 and tracy-airbnb/j6 1.2.0 (the Airbnb design on the same base archive) keep
// their identity in module 224, and the footer's legal line already says `{site.name}`. The seed
// writes the name and its mark into the identity module and leaves the legal line on the token, so
// a rename in the identity module reaches the footer too.
for (const contract of ['tracy-apple/j6/1.3.0', 'tracy-airbnb/j6/1.2.0']) {
  test(`${contract}: the identity module takes the name, and the legal line keeps the token`, () => {
    const slots = [
      ...['Tracy Apple', '', 'Precision, in every surface', 'TA', '', '', '', '', '', '', '', '', ''].map(
        (sample, i) => ({ key: `module-224.${i}`, sample, maxCharacters: 255, requiresEvidence: false })
      ),
      { key: 'module-175.0', sample: '© 2026 {site.name}. A JoomlArt T4 template.', maxCharacters: 104 }
    ]
    const { values, pending } = resolveChromeSlots({
      contract,
      slots,
      site: { name: 'Ăn Hỏi Sarah & Co', contact: '12 Lê Lợi, Huế · Hotline: +84 905 123 456' },
      now: NOW
    })
    assert.deepEqual(pending, [])
    assert.equal(values['module-224.0'], 'Ăn Hỏi Sarah & Co')
    assert.equal(values['module-224.2'], '')
    assert.equal(values['module-224.3'], 'ĂHS')
    assert.equal(values['module-224.5'], '+84 905 123 456')
    assert.equal(values['module-224.6'], '12 Lê Lợi, Huế')
    assert.equal(values['module-175.0'], '© 2026 {site.name}.')
  })

  test(`${contract}: the identity module takes the email, the hours and the profiles the brief gave`, () => {
    const slots = Array.from({ length: 13 }, (_, i) => ({
      key: `module-224.${i}`,
      sample: '',
      maxCharacters: i >= 8 ? 2048 : 255,
      requiresEvidence: false
    }))
    const { values, pending } = resolveChromeSlots({ contract, slots, site: GOLDEN_CRUST, now: NOW })
    assert.deepEqual(pending, [])
    assert.equal(values['module-224.4'], 'hello@goldencrust.example')
    assert.equal(values['module-224.6'], '12 Hang Bac, Hanoi')
    assert.equal(values['module-224.7'], 'Open 6am-8pm every day')
    assert.equal(values['module-224.9'], 'https://instagram.com/goldencrust')
    assert.equal(values['module-224.8'], '')
  })
}
