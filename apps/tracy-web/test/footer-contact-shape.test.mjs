// The footer keeps the template's footer shape (spec TracyHQ/tracy#189, COO decision of 30/10/2026, site build rule 5): a
// footer contact block the content map declares is a summary block whatever its page assignment, a demo footer whose lines
// lead to `#` is a contact block, and each line keeps its kind up to the demo's count of it. Every other channel is the
// Contact page's. All businesses are made up: a plumber and a florist.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moduleContactSteps } from '../src/sites/brief-engines/joomla-contact-links.js'
import { summaryModuleIds } from '../src/sites/brief-engines/joomla-plan-contacts.js'

// A plumber: two numbers, WhatsApp, an Instagram DM, a mailbox and the areas served.
const plumber = {
  contact: {
    phone: { value: '+1 555 030 0100', href: 'tel:+15550300100' },
    email: { value: 'fix@pipeworks.example', href: 'mailto:fix@pipeworks.example' },
    address: { value: '12 Valve Street, Drainford' },
    serviceArea: { value: 'All of Drainford county' }
  },
  channels: [
    { kind: 'phone', value: '+1 555 030 0100', href: 'tel:+15550300100', label: 'Call +1 555 030 0100' },
    { kind: 'phone', value: '+1 555 030 0199', href: 'tel:+15550300199', label: 'Call +1 555 030 0199' },
    { kind: 'whatsapp', value: '+1 555 030 0199', href: 'https://wa.me/15550300199', label: 'WhatsApp us' },
    {
      kind: 'message',
      value: 'instagram',
      href: 'https://ig.me/m/pipeworks',
      label: 'Message us on Instagram'
    }
  ]
}

// A footer as the template ships it: one phone, the address, one mailbox, every link empty.
const demoFooter =
  '<a href="#" class="text-primary lead mb-3 d-block">(555) 010-0108</a>\r\n<p class="mb-3">\r\n  1 Sample Road<br/>Demoville\r\n</p>\r\n' +
  '<a href="#" class="link-underline">sales@demo.example</a>'

/** A content map with one footer contact block (module 40) and the contact page's own block (module 41). */
const contentMapOf = (/** @type {any[]} */ contactBlocks, phoneSlots = 1) => ({
  entities: [
    { key: 'module-40', kind: 'module', identity: { module: 'mod_custom', position: 'footer-2' } },
    { key: 'module-41', kind: 'module', identity: { module: 'mod_custom', position: 'content-top' } }
  ],
  contactBlocks,
  slots: [
    ...Array.from({ length: phoneSlots }, (_, i) => ({
      key: `module-40.p${i}`,
      entity: 'module-40',
      type: 'text',
      role: 'contact.phone'
    })),
    { key: 'module-40.a', entity: 'module-40', type: 'text', role: 'contact.address' },
    { key: 'module-40.e', entity: 'module-40', type: 'text', role: 'contact.email' },
    { key: 'module-41.p', entity: 'module-41', type: 'text', role: 'contact.phone' }
  ]
})

const modules = [
  { id: 40, published: 1, language: '*', content: demoFooter },
  { id: 41, published: 1, language: '*', content: demoFooter }
]
/** A site whose module assignments say every page for both blocks, or cannot be read. */
const applyOf = (/** @type {Record<number, string> | null} */ menuids) => async (/** @type {any} */ call) =>
  menuids && call.action === 'content.get' && call.params.kind === 'moduleAssignment'
    ? { ok: true, item: { menuids: menuids[call.params.id] } }
    : { ok: false }

test('a declared footer block is a summary block whatever its assignment; a declared contact-page block never is', async () => {
  const map = contentMapOf([
    { id: 'footer-contact', placement: 'footer', container: 'module-40' },
    { id: 'contact-page', placement: 'contact-page', container: 'module-41' }
  ])
  assert.deepEqual([...(await summaryModuleIds(applyOf(null), 'site', modules, { contentMap: map }))], [40])
  assert.deepEqual(
    [...(await summaryModuleIds(applyOf({ 40: '[0]', 41: '[0]' }), 'site', modules, { contentMap: map }))],
    [40]
  )
})

test('a demo footer whose lines lead to # is a contact block: shown on every page, it is a summary block', async () => {
  // No declaration and no slot roles: the empty links that show a number and a mailbox are enough.
  const got = await summaryModuleIds(applyOf({ 40: '[0]', 41: '[7]' }), 'site', modules)
  assert.deepEqual([...got], [40])
})

test('the footer keeps the demo entries kind by kind; the contact page block gets every channel', async () => {
  const map = contentMapOf([{ id: 'footer-contact', placement: 'footer', container: 'module-40' }])
  const summaries = await summaryModuleIds(applyOf({ 40: '[0]', 41: '[7]' }), 'site', modules, {
    contentMap: map
  })
  const { steps } = moduleContactSteps({
    modules,
    contact: plumber.contact,
    visible: new Set(['*']),
    channels: plumber.channels,
    summaries,
    contentMap: map
  })
  const byId = Object.fromEntries(steps.map((s) => [s.id, s.fields.content]))
  const footer = byId[40]
  assert.equal((footer.match(/<a\b/g) ?? []).length, 2)
  assert.match(footer, /href="tel:\+15550300100"[^>]*>\+1 555 030 0100</)
  assert.match(footer, /href="mailto:fix@pipeworks\.example"[^>]*>fix@pipeworks\.example</)
  assert.doesNotMatch(footer, /0199|wa\.me|ig\.me|Drainford county|010-0108|demo\.example/)
  // The contact page's own block: both numbers, WhatsApp, the DM and the area beside the address.
  const page = byId[41]
  for (const want of ['tel:+15550300100', 'tel:+15550300199', 'wa.me/15550300199', 'ig.me/m/pipeworks'])
    assert.ok(page.includes(want), want)
})

test('a footer the demo gives two call lines shows two numbers; a florist with no mailbox loses the mailbox line', async () => {
  const twoPhones =
    '<a href="#" class="d-block">(555) 010-0108</a><a href="#" class="d-block">(555) 010-0109</a>' +
    '<p>1 Sample Road</p><a href="#" class="link-underline">sales@demo.example</a>'
  const map = contentMapOf([{ id: 'footer-contact', placement: 'footer', container: 'module-40' }], 2)
  const rows = [{ id: 40, published: 1, language: '*', content: twoPhones }]
  const { steps } = moduleContactSteps({
    modules: rows,
    contact: plumber.contact,
    visible: new Set(['*']),
    channels: plumber.channels,
    summaries: new Set([40]),
    contentMap: map
  })
  assert.equal((steps[0].fields.content.match(/href="tel:/g) ?? []).length, 2)
  // A florist: one number, an Instagram DM, no mailbox. The mailbox line goes; no DM takes its place.
  const florist = {
    contact: {
      phone: { value: '+1 555 040 0200', href: 'tel:+15550400200' },
      address: { value: '3 Stem Lane' }
    },
    channels: [
      { kind: 'phone', value: '+1 555 040 0200', href: 'tel:+15550400200', label: 'Call +1 555 040 0200' },
      {
        kind: 'message',
        value: 'instagram',
        href: 'https://ig.me/m/stemandpetal',
        label: 'Message us on Instagram'
      }
    ]
  }
  const flo = moduleContactSteps({
    modules: [{ id: 40, published: 1, language: '*', content: demoFooter }],
    contact: florist.contact,
    visible: new Set(['*']),
    channels: florist.channels,
    summaries: new Set([40]),
    contentMap: contentMapOf([{ id: 'footer-contact', placement: 'footer', container: 'module-40' }])
  }).steps[0].fields.content
  assert.equal((flo.match(/<a\b/g) ?? []).length, 1)
  assert.match(flo, /href="tel:\+15550400200"/)
  assert.doesNotMatch(flo, /ig\.me|mailto:|demo\.example/)
})
