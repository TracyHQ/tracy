// Every real contact channel a brief holds is shown and clickable on a Joomla brief build (spec TracyHQ/tracy#189, COO rule
// 29/10/2026): each phone its own call line, WhatsApp only on a number with evidence, the DM link of each network the brief
// has; added as sibling lines in the block's own markup without moving a node a contract slot binds to. All made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joomlaContactLinks, moduleContactSteps } from '../src/sites/brief-engines/joomla-contact-links.js'
import { boundNodes } from '../src/sites/brief-engines/joomla-contact-lines.js'
import { plannedSlotValues } from '../src/sites/brief-engines/joomla-outside-map.js'
import { heroSlotValues } from '../src/sites/brief-engines/hero-lines.js'
import { heroSecondButtonSteps } from '../src/sites/brief-engines/joomla-hero-second-button.js'

// A dental clinic: two numbers, WhatsApp evidence on the second, Instagram.
const clinic = [
  { kind: 'phone', value: '+44 20 7946 0101', href: 'tel:+442079460101', label: 'Call +44 20 7946 0101' },
  { kind: 'phone', value: '+44 7700 900 202', href: 'tel:+447700900202', label: 'Call +44 7700 900 202' },
  { kind: 'whatsapp', value: '+44 7700 900 202', href: 'https://wa.me/447700900202', label: 'WhatsApp us' },
  {
    kind: 'message',
    value: 'instagram',
    href: 'https://ig.me/m/brightsmile.studio',
    label: 'Message us on Instagram'
  }
]
const clinicContact = {
  phone: { value: '+44 20 7946 0101', href: 'tel:+442079460101' },
  address: { value: '8 Molar Row, Toothbury' }
}
// A footer contact block as the template ships it, written by the contract: phone, address, and the mailbox link that the
// plan gave the DM (no mailbox in the brief).
const footer =
  '<a href="tel:+442079460101" class="text-primary lead d-block">+44 20 7946 0101</a>\n<p class="mb-3">8 Molar Row, Toothbury</p>\n<a href="#" class="link-underline">Message us on Instagram</a>'
const bound = [
  '/html/body/div/a[1]/text()',
  '/html/body/div/p',
  '/html/body/div/a[2]/text()',
  '/html/body/div/a[2]/@href'
]

test('a footer block shows the second number, WhatsApp and the DM, each clickable, and no bound node moves', () => {
  const out = joomlaContactLinks(footer, clinicContact, { channels: clinic, bound }).html
  assert.match(
    out,
    /<a href="https:\/\/ig\.me\/m\/brightsmile\.studio" class="link-underline"[^>]*>Message us on Instagram<\/a>/
  )
  assert.match(out, /<a href="tel:\+447700900202" class="text-primary lead d-block">\+44 7700 900 202<\/a>/)
  assert.match(
    out,
    /<a href="https:\/\/wa\.me\/447700900202" class="link-underline d-table"[^>]*>WhatsApp us<\/a>/
  )
  for (const path of bound) assert.equal(boundNodes(out, path)?.length, 1, `${path} still finds one node`)
  assert.equal(boundNodes(out, '/html/body/div/a[2]/text()')[0].value, 'Message us on Instagram')
  // Written again, nothing changes.
  assert.equal(joomlaContactLinks(out, clinicContact, { channels: clinic, bound }).html, out)
})

test('the area line beside the address never makes the address path ambiguous', () => {
  const contact = { ...clinicContact, serviceArea: { value: 'Visits across Toothbury' } }
  const out = joomlaContactLinks(footer, contact, { channels: clinic.slice(0, 1), bound }).html
  assert.match(out, /<p class="mb-3">Visits across Toothbury<\/p>/)
  assert.equal(boundNodes(out, '/html/body/div/p')?.length, 1)
})

test('a demo number on a second phone line takes the second number; a list block clones its own list line', () => {
  const list =
    '<ul><li><a href="tel:5550100"><i class="fa fa-phone"></i> (555) 010-0100</a></li><li><a href="tel:5550101">(555) 010-0101</a></li></ul>'
  const out = joomlaContactLinks(list, clinicContact, { channels: clinic }).html
  assert.match(out, /<a href="tel:\+442079460101"><i class="fa fa-phone"><\/i> \+44 20 7946 0101<\/a>/)
  assert.match(out, /<a href="tel:\+447700900202">\+44 7700 900 202<\/a>/)
  assert.match(out, /<li><a href="https:\/\/wa\.me\/447700900202"[^>]*>WhatsApp us<\/a><\/li>/)
  assert.match(
    out,
    /<li><a href="https:\/\/ig\.me\/m\/brightsmile\.studio"[^>]*>Message us on Instagram<\/a><\/li>/
  )
})

test('a bakery with only Instagram and Facebook: a block with a mailbox link gets both DMs; a florist with nothing gets nothing', () => {
  const bakery = [
    {
      kind: 'message',
      value: 'instagram',
      href: 'https://ig.me/m/crumb_and_crust',
      label: 'Message us on Instagram'
    },
    {
      kind: 'message',
      value: 'facebook',
      href: 'https://m.me/crumbandcrust',
      label: 'Message us on Facebook'
    }
  ]
  const mailBlock = '<p><a href="mailto:hi@crumbs.example">hi@crumbs.example</a></p>'
  const out = joomlaContactLinks(
    mailBlock,
    { email: { value: 'hi@crumbs.example', href: 'mailto:hi@crumbs.example' } },
    {
      channels: bakery
    }
  ).html
  assert.match(out, /ig\.me\/m\/crumb_and_crust/)
  assert.match(out, /m\.me\/crumbandcrust/)
  // A block of social icons is not a contact block: nothing is added to it.
  const icons = '<a href="https://instagram.com/crumb_and_crust"><i class="fa fa-instagram"></i></a>'
  assert.equal(joomlaContactLinks(icons, {}, { channels: bakery }).html, icons)
  assert.deepEqual(
    moduleContactSteps({
      modules: [{ id: 3, published: 1, content: footer }],
      contact: null,
      visible: new Set()
    }).steps,
    []
  )
})

test('the plan’s contact block lines are written by the contract: the address line and a channel line, never a record’s', () => {
  const plan = {
    slots: [
      {
        key: 'module-5.2',
        role: 'contact.address',
        decision: 'value',
        reason: 'contact-fact',
        value: '8 Molar Row'
      },
      {
        key: 'contact-1.1',
        role: 'contact.address',
        decision: 'value',
        reason: 'contact-fact',
        value: '8 Molar Row'
      },
      {
        key: 'module-5.4',
        role: 'contact.email',
        decision: 'value',
        reason: 'contact-channel',
        value: 'Message us on Instagram'
      },
      {
        key: 'module-5.1',
        role: 'contact.phone',
        decision: 'value',
        reason: 'contact-fact',
        value: '+44 20 7946 0101'
      }
    ]
  }
  assert.deepEqual(plannedSlotValues(plan), {
    'module-5.2': '8 Molar Row',
    'module-5.4': 'Message us on Instagram'
  })
})

test('a card button the writer left as a bare "Contact" names its action; one named by its action keeps its words', () => {
  const plan = {
    slots: [
      {
        key: 'module-20.6',
        decision: 'value',
        reason: 'cta-action',
        when: 'bare-contact',
        value: 'Learn more'
      }
    ]
  }
  assert.deepEqual(
    heroSlotValues(plan, 'en', () => 'CONTACT'),
    { 'module-20.6': 'Learn more' }
  )
  assert.deepEqual(
    heroSlotValues(plan, 'en', () => 'Book a check-up'),
    {}
  )
})

test('the hero second button the template ships empty is written through its module parameters', () => {
  const second = {
    label: { key: 'module-3.4', value: 'WhatsApp us' },
    href: { key: 'module-3.5', value: 'https://wa.me/447700900202' }
  }
  const slots = [
    {
      key: 'module-3.4',
      entity: 'module-3',
      column: 'params',
      nestedJson: 'cfg',
      jsonPath: ['hero', 'hero[button-2]', 0]
    },
    {
      key: 'module-3.5',
      entity: 'module-3',
      column: 'params',
      nestedJson: 'cfg',
      jsonPath: ['hero', 'hero[btn-link-2]', 0]
    }
  ]
  const cfg = { hero: { 'hero[button]': ['Call us'], 'hero[button-2]': [''], 'hero[btn-link-2]': [''] } }
  const modules = [{ id: 3, published: 1, params: JSON.stringify({ cfg: JSON.stringify(cfg), cache: '1' }) }]
  const steps = heroSecondButtonSteps({ second, slots, modules })
  assert.equal(steps.length, 1)
  const written = JSON.parse(JSON.parse(steps[0].fields.params).cfg)
  assert.deepEqual(written.hero['hero[button-2]'], ['WhatsApp us'])
  assert.deepEqual(written.hero['hero[btn-link-2]'], ['https://wa.me/447700900202'])
  assert.deepEqual(written.hero['hero[button]'], ['Call us'])
  // A button a person already filled keeps its words; no second button planned writes nothing.
  const filled = JSON.stringify({
    cfg: JSON.stringify({ hero: { ...cfg.hero, 'hero[button-2]': ['Visit us'] } })
  })
  assert.deepEqual(heroSecondButtonSteps({ second, slots, modules: [{ id: 3, params: filled }] }), [])
  assert.deepEqual(heroSecondButtonSteps({ second: null, slots, modules }), [])
})

// A footer icon row as a JA ACM module keeps it: parallel lists of icon, title and link, four items.
const iconRow = (icons, titles) =>
  JSON.stringify({
    ':type': 'demo:social',
    social: {
      'social[font-icon]': icons,
      'social[title]': titles,
      'social[link]': icons.map(() => '#')
    }
  })
const row4 = () => ({
  'jatools-config': iconRow(
    ['fa fa-facebook', 'fa fa-instagram', 'fa fa-twitter', 'fa fa-telegram'],
    ['Facebook', 'Instagram', 'Twitter', 'Telegram']
  )
})

test('the icon row calls and mails the business first, then WhatsApp, then its networks, in the template’s icon font', async () => {
  const { socialListParams } = await import('../src/sites/brief-engines/joomla-plan-social-lists.js')
  // A dental clinic with one number and a mailbox, Instagram and WhatsApp.
  const socials = {
    keep: { instagram: 'https://www.instagram.com/brightsmile.studio/' },
    whatsapp: 'https://wa.me/447700900202'
  }
  const contacts = {
    phones: [{ href: 'tel:+442079460101', value: '+44 20 7946 0101' }],
    email: { href: 'mailto:hello@brightsmile.example' }
  }
  const out = JSON.parse(socialListParams(row4(), socials, contacts).params['jatools-config']).social
  assert.deepEqual(out['social[font-icon]'], [
    'fa fa-phone',
    'fa fa-envelope',
    'fa fa-whatsapp',
    'fa fa-instagram'
  ])
  assert.deepEqual(out['social[title]'], ['Call +44 20 7946 0101', 'Email us', 'WhatsApp us', 'Instagram'])
  assert.deepEqual(out['social[link]'], [
    'tel:+442079460101',
    'mailto:hello@brightsmile.example',
    'https://wa.me/447700900202',
    'https://www.instagram.com/brightsmile.studio/'
  ])
})

test('a bakery with a phone only: one call icon, the main number (one icon per kind); the rest emptied in place', async () => {
  const { socialListParams } = await import('../src/sites/brief-engines/joomla-plan-social-lists.js')
  const phones = [
    { href: 'tel:+15550100100', value: '+1 555 010 0100' },
    { href: 'tel:+15550100101', value: '+1 555 010 0101' }
  ]
  const two = JSON.parse(
    socialListParams(row4(), { keep: {} }, { phones, email: null }).params['jatools-config']
  ).social
  assert.deepEqual(two['social[link]'], ['tel:+15550100100', '', '', ''])
  assert.deepEqual(two['social[title]'], ['Call +1 555 010 0100', '', '', ''])
  // Four items, two numbers, three networks: still one call icon.
  const socials = {
    keep: {
      facebook: 'https://facebook.com/crumbandcrust',
      instagram: 'https://instagram.com/crumb_and_crust',
      tiktok: 'https://www.tiktok.com/@crumb'
    }
  }
  const full = JSON.parse(
    socialListParams(row4(), socials, { phones, email: null }).params['jatools-config']
  ).social
  assert.deepEqual(full['social[font-icon]'], [
    'fa fa-phone',
    'fa fa-facebook',
    'fa fa-instagram',
    'fa fa-tiktok'
  ])
  assert.equal(full['social[link]'].filter((l) => l.startsWith('tel:')).length, 1)
})

test('a contact record shows the second number on its mobile line; with one number the demo mobile goes', async () => {
  const { contactSteps } = await import('../src/sites/brief-engines/joomla-tidy.js')
  const row = {
    id: 1,
    published: 1,
    language: '*',
    name: 'Demo',
    telephone: '(555) 010-0000',
    mobile: '(555) 010-0001'
  }
  const door = async ({ action, params }) =>
    action === 'content.list' && params.kind === 'contact'
      ? { ok: true, items: params.offset ? [] : [row] }
      : { ok: true, items: [] }
  const run = async (channels) =>
    (
      await contactSteps({
        apply: door,
        siteKey: 's',
        given: { phone: '+44 20 7946 0101' },
        visible: new Set(),
        channels
      })
    ).steps[0].fields
  assert.equal((await run(clinic)).mobile, '+44 7700 900 202')
  assert.equal((await run(clinic.slice(0, 1))).mobile, '')
})

test('the block reads in the contact order: every number, then the chat app, the address and area, the DMs last; equal spacing', () => {
  // A made-up yoga studio footer: the phone line carries the template's spacing (`d-block mb-3`), the DM line does not.
  const studio = [
    { kind: 'phone', value: '+971 50 000 0101', href: 'tel:+971500000101', label: 'Call +971 50 000 0101' },
    { kind: 'phone', value: '+971 50 000 0202', href: 'tel:+971500000202', label: 'Call +971 50 000 0202' },
    { kind: 'whatsapp', value: '+971 50 000 0101', href: 'https://wa.me/971500000101', label: 'WhatsApp us' },
    { kind: 'zalo', value: '+84 90 000 0303', href: 'https://zalo.me/84900000303', label: 'Zalo us' },
    { kind: 'message', value: 'facebook', href: 'https://m.me/lotus.loft', label: 'Message us on Facebook' }
  ]
  const contact = {
    phone: { value: '+971 50 000 0101', href: 'tel:+971500000101' },
    address: { value: '3 Example Walk, Sandtown' },
    serviceArea: { value: 'Classes across Sandtown' }
  }
  const html =
    '<a href="tel:+971500000101" class="text-primary lead mb-3 d-block">+971 50 000 0101</a>\n<p class="mb-3">3 Example Walk, Sandtown</p>'
  const paths = ['/html/body/div/a[1]/text()', '/html/body/div/p/text()']
  const out = joomlaContactLinks(html, contact, { channels: studio, bound: paths }).html
  const order = [
    '+971 50 000 0101',
    '+971 50 000 0202',
    'WhatsApp us',
    'Zalo us',
    '3 Example Walk, Sandtown',
    'Classes across Sandtown',
    'Message us on Facebook'
  ].map((words) => out.indexOf(words))
  assert.ok(
    order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])),
    `contact order in ${out}`
  )
  // The chat app and DM lines take the spacing of the line they follow: the same gap between every line.
  assert.match(out, /<a href="https:\/\/wa\.me\/971500000101" class="[^"]*\bmb-3\b[^"]*\bd-block\b[^"]*"/)
  assert.match(out, /<a href="https:\/\/zalo\.me\/84900000303" class="[^"]*\bmb-3\b[^"]*"/)
  assert.match(out, /<a href="https:\/\/m\.me\/lotus\.loft" class="[^"]*\bd-block\b[^"]*"/)
  for (const path of paths) assert.equal(boundNodes(out, path)?.length, 1, `${path} still finds one node`)
  assert.equal(joomlaContactLinks(out, contact, { channels: studio, bound: paths }).html, out)
})

test('an address cut short for its box still gets the area line beside it', () => {
  const contact = {
    phone: { value: '+971 50 000 0101', href: 'tel:+971500000101' },
    address: { value: '3 Example Walk - Sandtown - United Arab Emirates' },
    serviceArea: { value: 'Classes across Sandtown' }
  }
  const html =
    '<a href="tel:+971500000101" class="d-block">+971 50 000 0101</a>\n<p class="mb-3">3 Example Walk - Sandtown</p>'
  const out = joomlaContactLinks(html, contact, { bound: ['/html/body/div/p'] }).html
  assert.match(
    out,
    /<p class="mb-3">3 Example Walk - Sandtown<\/p><div><p class="mb-3">Classes across Sandtown<\/p><\/div>/
  )
  // A line that only starts like the address (inside a word) is no address line.
  const other = '<a href="tel:+971500000101">+971 50 000 0101</a><p>3 Example Wal</p>'
  assert.doesNotMatch(joomlaContactLinks(other, contact).html, /Classes across/)
})

test('Zalo joins the icon row only where the template draws it; a Font Awesome row leaves it to the contact lines', async () => {
  const { socialListParams } = await import('../src/sites/brief-engines/joomla-plan-social-lists.js')
  // A made-up noodle bar with one number, Facebook and Zalo.
  const socials = {
    keep: { facebook: 'https://www.facebook.com/noodle.example/' },
    zalo: 'https://zalo.me/84900001234'
  }
  const contacts = { phones: [{ href: 'tel:+84900001234', value: '+84 90 000 1234' }], email: null }
  const fa = JSON.parse(socialListParams(row4(), socials, contacts).params['jatools-config']).social
  assert.deepEqual(fa['social[font-icon]'].slice(0, 2), ['fa fa-phone', 'fa fa-facebook'])
  assert.ok(
    !fa['social[link]'].some((l) => /zalo/.test(l)),
    'no Zalo item drawn with another network’s glyph'
  )
  // A template that ships its own Zalo item keeps its icon and links it.
  const own = {
    'jatools-config': iconRow(
      ['icon-zalo', 'fa fa-facebook', 'fa fa-instagram'],
      ['Zalo', 'Facebook', 'Instagram']
    )
  }
  const out = JSON.parse(socialListParams(own, socials, contacts).params['jatools-config']).social
  const at = out['social[link]'].indexOf('https://zalo.me/84900001234')
  assert.ok(at >= 0)
  assert.equal(out['social[font-icon]'][at], 'icon-zalo')
  assert.equal(out['social[title]'][at], 'Zalo us')
})

test('a Zalo channel is a contact line beside the numbers, and a template Zalo link takes the business’s number', () => {
  const channels = [
    { kind: 'phone', value: '+84 90 000 1234', href: 'tel:+84900001234', label: 'Call +84 90 000 1234' },
    {
      kind: 'zalo',
      value: '+84 90 000 1234',
      href: 'https://zalo.me/84900001234',
      label: 'Zalo us',
      inferred: true
    }
  ]
  const contact = { phone: { value: '+84 90 000 1234', href: 'tel:+84900001234' } }
  const added = joomlaContactLinks('<a href="tel:0">+84 90 000 9999</a>', contact, { channels }).html
  assert.match(added, /<a href="https:\/\/zalo\.me\/84900001234"[^>]*>Zalo us<\/a>/)
  const demo = '<a href="tel:0">+84 90 000 9999</a> <a href="https://zalo.me/0123456789">Chat with us</a>'
  const moved = joomlaContactLinks(demo, contact, { channels }).html
  assert.match(moved, /<a href="https:\/\/zalo\.me\/84900001234">Chat with us<\/a>/)
  assert.equal((moved.match(/zalo\.me/g) ?? []).length, 1)
})
