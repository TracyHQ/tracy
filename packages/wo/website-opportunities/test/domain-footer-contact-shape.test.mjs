// The footer keeps the template's footer shape (spec TracyHQ/tracy#189, COO decision of 30/10/2026, site build rule 5), for
// every CMS: the plan writes no other channel into a footer line, the packing check refuses a footer contact block the
// content map does not declare, the final check names a footer line beyond the demo's shape, and the Contact page carries
// every channel the footer carries. All businesses are made up: a plumber and a florist.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planSite } from '../domain/site-plan.mjs'
import {
  contactBlockProblems,
  contactBlocksOf,
  summaryContactShape
} from '../domain/footer-contact-shape.mjs'
import { channelLeftovers } from '../domain/demo-leftovers-channels.mjs'
import { contactPageFindings } from '../domain/contact-page.mjs'

// A plumber: two numbers (WhatsApp on the second), an Instagram profile, no mailbox.
const plumber = {
  business: {
    name: 'Pipeworks Plumbing',
    phone: '+1 555 030 0100',
    otherPhones: [{ phone: '+1 555 030 0199', whatsapp: true }],
    address: '12 Valve Street, Drainford',
    socials: { instagram: 'https://www.instagram.com/pipeworks.plumbing/' }
  }
}

/** A content map with a footer contact block (phone, address, mailbox) in a footer place, declared or not. */
const mapOf = (/** @type {any[] | undefined} */ contactBlocks) => ({
  entities: [{ key: 'module-12', kind: 'module', identity: { module: 'mod_custom', position: 'footnav-2' } }],
  pages: [],
  ...(contactBlocks ? { contactBlocks } : {}),
  slots: [
    ['module-12.1', 'contact.phone', '(555) 010-0108', '/html/body/div/a[1]/text()'],
    ['module-12.2', 'contact.address', '1 Sample Road, Demoville', '/html/body/div/p'],
    ['module-12.4', 'contact.email', 'sales@demo.example', '/html/body/div/a[2]/text()']
  ].map(([key, role, sample, xpath]) => ({
    key,
    entity: 'module-12',
    column: 'content',
    type: 'text',
    role,
    sample,
    xpath,
    group: { id: 'module-12.contact', item: 0, kind: 'contact' }
  }))
})
const declared = mapOf([{ id: 'footer-contact', placement: 'footer', container: 'module-12' }])

test('a footer mailbox line with no mailbox in the brief takes no other channel; the phone line takes the main number', () => {
  for (const map of [declared, mapOf(undefined)]) {
    const plan = planSite(plumber, { questions: [] }, { contentMap: map })
    const slot = (/** @type {string} */ key) => plan.slots.find((s) => s.key === key)
    assert.equal(slot('module-12.1').value, '+1 555 030 0100')
    assert.notEqual(slot('module-12.4').reason, 'contact-channel')
    assert.equal(slot('module-12.4').value, undefined)
    // The channels stay in the plan for the Contact page.
    assert.deepEqual(
      plan.channels.map((c) => c.kind),
      ['phone', 'phone', 'whatsapp', 'message']
    )
  }
})

test('the contact blocks of a map carry the demo entries; an undeclared footer block is inferred from its place', () => {
  assert.deepEqual(contactBlocksOf(declared), [
    {
      id: 'footer-contact',
      placement: 'footer',
      container: 'module-12',
      entries: { phone: 1, address: 1, email: 1 }
    }
  ])
  assert.equal(contactBlocksOf(mapOf(undefined))[0].inferred, true)
  assert.deepEqual(
    [...(summaryContactShape(declared) ?? [])],
    [
      ['phone', 1],
      ['address', 1],
      ['email', 1]
    ]
  )
})

test('the packing check refuses a footer contact block not declared, or declared with a wrong placement or container', () => {
  assert.deepEqual(contactBlockProblems(declared), [])
  assert.match(
    contactBlockProblems(mapOf(undefined)).join('\n'),
    /module-12 is not declared in contactBlocks/
  )
  assert.match(
    contactBlockProblems(mapOf([{ id: 'x', placement: 'contact-page', container: 'module-12' }])).join('\n'),
    /placement must be "footer"/
  )
  assert.match(
    contactBlockProblems(mapOf([{ id: 'x', placement: 'side', container: 'module-99' }])).join('\n'),
    /placement must be one of.*\n.*module-99 is no entity/
  )
})

// A florist's served pages: the same footer on every page.
const footerOf = (/** @type {string} */ lines) => `<footer><h3>Get in touch</h3>${lines}</footer>`
const florist = { business: { name: 'Stem and Petal', address: '3 Stem Lane, Bloomton' } }
const pagesWith = (/** @type {string} */ footer, contactBody = '') => [
  { path: '/', status: 200, html: `<main><h1>Flowers</h1></main>${footer}` },
  { path: '/about', status: 200, html: `<main><h1>Our shop</h1></main>${footer}` },
  { path: '/contact', status: 200, html: `<main><h1>Contact</h1>${contactBody}</main>${footer}` }
]

test('the final check names a footer line beyond the demo shape: a kind the demo lacks, or a second number', () => {
  const shaped = footerOf(
    '<a href="tel:+15550400200">+1 555 040 0200</a><p>3 Stem Lane, Bloomton</p><a href="mailto:hi@stem.example">hi@stem.example</a>'
  )
  const ctx = (/** @type {string} */ footer) => ({
    served: pagesWith(footer),
    brief: florist,
    contentMap: declared
  })
  assert.deepEqual(channelLeftovers(ctx(shaped)), [])
  const grown = footerOf(
    '<a href="tel:+15550400200">+1 555 040 0200</a><a href="tel:+15550400201">+1 555 040 0201</a>' +
      '<a href="https://wa.me/15550400201">WhatsApp us</a><p>3 Stem Lane, Bloomton</p>' +
      '<a href="https://ig.me/m/stemandpetal">Message us on Instagram</a>'
  )
  const found = channelLeftovers(ctx(grown))
    .filter((f) => f.place === 'summary contact block')
    .map((f) => f.found.split(' ').slice(0, 2).join(' '))
  assert.deepEqual(found.sort(), ['1 message', '1 whatsapp', '2 phone'])
  // Without a content map, one of each kind: the phone and the mailbox side by side are no finding.
  assert.deepEqual(channelLeftovers({ served: pagesWith(shaped), brief: florist }), [])
})

test('the Contact page carries every channel the footer carries: a footer channel missing from its body is a finding', () => {
  const footer = footerOf(
    '<a href="tel:+15550400200">+1 555 040 0200</a><a href="mailto:hi@stem.example">hi@stem.example</a>'
  )
  const plan = {
    contact: { phone: { value: '+1 555 040 0200', href: 'tel:+15550400200' } },
    channels: [
      { kind: 'phone', value: '+1 555 040 0200', href: 'tel:+15550400200', label: '+1 555 040 0200' }
    ]
  }
  const body = '<ul><li><a href="tel:+15550400200">+1 555 040 0200</a></li></ul>'
  const missing = contactPageFindings({ pages: pagesWith(footer, body), plan, contactPath: '/contact' })
  assert.deepEqual(
    missing.map((f) => f.why),
    ['The Contact page does not link the email channel its footer shows (mailto:hi@stem.example)']
  )
  const full = `${body}<a href="mailto:hi@stem.example">hi@stem.example</a>`
  assert.deepEqual(contactPageFindings({ pages: pagesWith(footer, full), plan, contactPath: '/contact' }), [])
})
