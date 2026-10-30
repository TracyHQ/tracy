// One icon per contact channel kind, and the demo's lines kind by kind in a summary contact block (spec TracyHQ/tracy#189, COO
// decisions of 30/10/2026). An icon row (footer, header, floating buttons) shows at most one icon per kind: the main number,
// never a second identical phone icon; a phone and a mobile are one kind. A summary contact block (a block shown on every
// page, such as a footer "Get in touch") keeps the template's footer shape: each line keeps its kind and shows the business's
// own primary of it, a kind the business lacks goes, and no line is added. The full list stays where the full text is shown
// (the contact page). All businesses are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joomlaContactLinks, moduleContactSteps } from '../src/sites/brief-engines/joomla-contact-links.js'
import { socialListParams } from '../src/sites/brief-engines/joomla-plan-social-lists.js'
import { summaryModuleIds } from '../src/sites/brief-engines/joomla-plan-contacts.js'

// A bakery: two numbers, the first one the main.
const bakeryPhones = [
  { href: 'tel:+15550100100', value: '+1 555 010 0100' },
  { href: 'tel:+15550100101', value: '+1 555 010 0101' }
]
// A dental clinic: two numbers, WhatsApp on the second, an Instagram DM.
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
  email: { value: 'hello@brightsmile.example', href: 'mailto:hello@brightsmile.example' },
  address: { value: '8 Molar Row, Toothbury' }
}

const iconRow = (/** @type {string[]} */ icons) =>
  JSON.stringify({
    ':type': 'demo:social',
    social: {
      'social[font-icon]': icons,
      'social[title]': icons.map(() => ''),
      'social[link]': icons.map(() => '#')
    }
  })

test('an icon row shows one phone icon, the main number, even with room for both', () => {
  const row = {
    'jatools-config': iconRow(['fa fa-facebook', 'fa fa-instagram', 'fa fa-twitter', 'fa fa-telegram'])
  }
  const out = JSON.parse(
    socialListParams(row, { keep: {} }, { phones: bakeryPhones, email: null }).params['jatools-config']
  ).social
  assert.deepEqual(out['social[link]'], ['tel:+15550100100', '', '', ''])
  assert.equal(out['social[font-icon]'].filter((c) => /fa-phone/.test(c)).length, 1)
})

test('a phone and a mobile icon of the template are one kind: the row keeps one call icon', () => {
  const row = {
    'jatools-config': iconRow(['fa fa-phone', 'fa fa-mobile', 'fa fa-envelope', 'fa fa-facebook'])
  }
  const socials = { keep: { facebook: 'https://facebook.com/brightsmile.studio' } }
  const contacts = {
    phones: [
      { href: 'tel:+442079460101', value: '+44 20 7946 0101' },
      { href: 'tel:+447700900202', value: '+44 7700 900 202' }
    ],
    email: { href: 'mailto:hello@brightsmile.example' }
  }
  const out = JSON.parse(socialListParams(row, socials, contacts).params['jatools-config']).social
  const calls = out['social[link]'].filter((l) => l.startsWith('tel:'))
  assert.deepEqual(calls, ['tel:+442079460101'])
  assert.deepEqual(out['social[link]'].filter(Boolean), [
    'tel:+442079460101',
    'mailto:hello@brightsmile.example',
    'https://facebook.com/brightsmile.studio'
  ])
})

test('icon-only links in a custom module: one per kind, the phone icon calls the main number', () => {
  const html =
    '<div class="icons"><a href="tel:5550100"><i class="fa fa-phone"></i></a><a href="tel:5550101"><i class="fa fa-mobile"></i></a>' +
    '<a href="mailto:demo@example.com"><i class="fa fa-envelope"></i></a><a href="mailto:sales@example.com"><i class="fa fa-envelope"></i></a></div>'
  const out = joomlaContactLinks(html, clinicContact, { channels: clinic }).html
  assert.equal((out.match(/href="tel:/g) ?? []).length, 1)
  assert.match(out, /href="tel:\+442079460101"/)
  assert.equal((out.match(/href="mailto:/g) ?? []).length, 1)
  assert.doesNotMatch(out, /<a\b[^>]*>\s*<\/a>/)
})

// A footer summary block as a template ships it: one phone, the address, one mailbox, every link empty.
const demoFooter =
  '<a href="#" class="text-primary lead mb-3 d-block">(555) 010-0100</a>\r\n<p class="mb-3">1 Demo Way, Sampleton</p>\r\n' +
  '<a href="#" class="link-underline">hello@demo.example</a>'
// The same block as a brief build left it before the rule: two numbers, WhatsApp, an area line, an Instagram DM.
const footer =
  '<a href="tel:+442079460101" class="text-primary lead mb-3 d-block">+44 20 7946 0101</a>' +
  '<div><a href="tel:+447700900202" class="text-primary lead mb-3 d-block">+44 7700 900 202</a> ' +
  '<a href="https://wa.me/447700900202" class="link-underline mb-3 d-table" target="_blank" rel="noopener">WhatsApp us</a></div>' +
  '<p class="mb-3">8 Molar Row, Toothbury</p><div><p class="mb-3">Across Toothbury</p></div>' +
  '<a href="https://ig.me/m/brightsmile.studio" class="link-underline" target="_blank" rel="noopener">Message us on Instagram</a>'
const demoCaps = { phone: 1, address: 1, email: 1 }

test('a summary block keeps one primary of each kind it shows: the main phone and the mailbox, nothing added', () => {
  const { html } = joomlaContactLinks(demoFooter, clinicContact, {
    channels: clinic,
    summary: true,
    caps: demoCaps
  })
  assert.equal((html.match(/<a\b/g) ?? []).length, 2)
  assert.match(html, /href="tel:\+442079460101"[^>]*>\+44 20 7946 0101</)
  assert.match(html, /href="mailto:hello@brightsmile\.example"[^>]*>hello@brightsmile\.example</)
  assert.doesNotMatch(html, /7700 900 202|wa\.me|ig\.me|demo\.example|010-0100/)
  assert.match(html, /1 Demo Way, Sampleton/)
  // A second number of the brief beside the first: the demo shows one, so the second line goes.
  const two = joomlaContactLinks(footer, clinicContact, { channels: clinic, summary: true }).html
  assert.equal((two.match(/href="tel:/g) ?? []).length, 1)
  assert.doesNotMatch(two, /<div>\s*<\/div>/)
})

test('a summary block line of a kind the business lacks goes; no other channel takes its place', () => {
  // A bakery the brief gives no number: the call line goes, WhatsApp is not put there; the mailbox line shows its mailbox.
  const bakery = [
    { kind: 'whatsapp', value: '+1 555 010 0199', href: 'https://wa.me/15550100199', label: 'WhatsApp us' },
    {
      kind: 'message',
      value: 'instagram',
      href: 'https://ig.me/m/crumb_and_crust',
      label: 'Message us on Instagram'
    }
  ]
  const bakeryContact = { email: { value: 'bake@crumb.example', href: 'mailto:bake@crumb.example' } }
  const demo =
    '<p><a href="tel:5550100">(555) 010-0100</a></p><p><a href="mailto:demo@example.com">demo@example.com</a></p>'
  const out = joomlaContactLinks(demo, bakeryContact, { channels: bakery, summary: true }).html
  assert.equal((out.match(/<a\b/g) ?? []).length, 1)
  assert.match(out, /mailto:bake@crumb\.example/)
  assert.doesNotMatch(out, /wa\.me|ig\.me|<p>\s*<\/p>/)
  // A florist with a number and no mailbox: the mailbox line goes, no direct message is put there.
  const florist = { phone: { value: '+1 555 020 0300', href: 'tel:+15550200300' } }
  const dm = [
    {
      kind: 'message',
      value: 'instagram',
      href: 'https://ig.me/m/petal.lane',
      label: 'Message us on Instagram'
    }
  ]
  const flo = joomlaContactLinks(demo, florist, { channels: dm, summary: true }).html
  assert.match(flo, /href="tel:\+15550200300"/)
  assert.doesNotMatch(flo, /mailto:|ig\.me|demo@example\.com/)
})

test('only modules shown on every page are summary blocks; the contact page block keeps every channel', async () => {
  const modules = [
    { id: 7, published: 1, language: '*', position: 'footer-2', content: footer },
    { id: 8, published: 1, language: '*', position: 'content-top', content: footer },
    { id: 9, published: 1, language: '*', position: 'footer-3', content: '<p>Opening soon</p>' },
    // A demo footer whose lines lead to `#`: a contact block all the same.
    { id: 10, published: 1, language: '*', position: 'footer-4', content: demoFooter }
  ]
  /** @type {Record<number, string>} */
  const menuids = { 7: '[0]', 8: '[112]', 9: '[0]', 10: '[0]' }
  const apply = async (/** @type {any} */ call) =>
    call.action === 'content.get' && call.params.kind === 'moduleAssignment'
      ? { ok: true, item: { menuids: menuids[call.params.id] } }
      : { ok: false }
  const summaries = await summaryModuleIds(apply, 'site', modules)
  assert.deepEqual([...summaries], [7, 10])
  const { steps } = moduleContactSteps({
    modules,
    contact: clinicContact,
    visible: new Set(['*']),
    channels: clinic,
    summaries
  })
  const byId = Object.fromEntries(steps.map((s) => [s.id, s.fields.content]))
  assert.equal((byId[7].match(/href="tel:/g) ?? []).length, 1)
  assert.equal((byId[10].match(/<a\b/g) ?? []).length, 2)
  // Module 8 sits on one chosen page: not a summary, nothing taken off.
  assert.equal(byId[8], undefined)
})

test('a summary row that a contract slot binds is hidden in place, never moved off its path', () => {
  // The template binds the second link of the block: taking it off would leave the path without a node.
  const bound = ['/html/body/div/a[2]/text()']
  const html =
    '<a href="tel:5550100" class="d-block">(555) 010-0100</a><a href="mailto:demo@example.com" class="d-block">demo@example.com</a>'
  const noMail = { phone: clinicContact.phone, address: clinicContact.address }
  const out = joomlaContactLinks(html, noMail, { channels: clinic, summary: true, bound }).html
  assert.match(out, /href="tel:\+442079460101"/)
  assert.match(out, /<a\b[^>]*\shidden\b[^>]*>[^<]*<\/a>/)
  assert.doesNotMatch(out, /demo@example\.com/)
})

test('a summary block keeps one location line: the street address; the areas served beside it go whole', () => {
  const contact = { ...clinicContact, serviceArea: { value: 'Across Toothbury' } }
  const { html } = joomlaContactLinks(footer, contact, { channels: clinic, summary: true })
  assert.match(html, /8 Molar Row, Toothbury/)
  assert.doesNotMatch(html, /Across Toothbury|<div>\s*<\/div>/)
  // With no street address, the areas are the location line and stay.
  const areaOnly = { phone: clinicContact.phone, serviceArea: { value: 'Across Toothbury' } }
  assert.match(
    joomlaContactLinks(footer, areaOnly, { channels: clinic, summary: true }).html,
    /Across Toothbury/
  )
})

test('only the summary rows whose removal would empty a bound path are hidden; the others go whole', () => {
  const bound = ['/html/body/div/div/a/@href']
  const html =
    '<a href="tel:5550100" class="d-block">(555) 010-0100</a><div><a href="tel:5550101" class="d-block">(555) 010-0101</a></div>' +
    '<a href="mailto:demo@example.com" class="d-block">demo@example.com</a>'
  const out = joomlaContactLinks(html, clinicContact, { channels: clinic, summary: true, bound }).html
  // The second call line goes (the block shows one number), hidden in place as the bound path needs its node.
  assert.equal((out.match(/\shidden\b/g) ?? []).length, 1)
  assert.match(out, /href="mailto:hello@brightsmile\.example"/)
})
