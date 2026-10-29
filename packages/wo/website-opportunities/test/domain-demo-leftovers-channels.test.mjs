// The final check on the served pages for the contact channel rules (spec TracyHQ/tracy#189, COO decision of 30/10/2026),
// read from the HTML any CMS serves: an icon row with two links of one channel kind, a summary contact block (one shown on
// every page) with more than one channel or with a second location line, and a visible address with a spaced dash between
// its parts. All businesses are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDemoLeftovers, LEFTOVER_KINDS } from '../domain/demo-leftovers.mjs'
import { channelLeftovers } from '../domain/demo-leftovers-channels.mjs'

const icon = (href, cls) =>
  `<div class="item"><a href="${href}"><i class="fa ${cls}"></i><span class="d-none">x</span></a></div>`
// A bakery: two numbers in its brief.
const bakery = {
  business: { name: 'Crumb and Crust', phone: '+1 555 010 0100', address: '4 Crumb Lane, Breadton' }
}
const pagesOf = (/** @type {string} */ body) => [
  { path: '/', html: `<main><h1>Fresh bread</h1></main>${body}` },
  { path: '/about', html: `<main><h1>Our ovens</h1></main>${body}` }
]
const ctxOf = (pages, brief = bakery) => ({ served: pages.map((p) => ({ ...p, status: 200 })), brief })

test('an icon row with two phone icons is a finding; a phone and a mobile icon are one kind', () => {
  const row = `<footer><div class="social">${icon('tel:+15550100100', 'fa-phone')}${icon('tel:+15550100101', 'fa-mobile')}${icon('https://instagram.com/crumb', 'fa-instagram')}</div></footer>`
  const found = channelLeftovers(ctxOf(pagesOf(row)))
  assert.ok(found.some((f) => /icon row/.test(f.place) && /phone/.test(f.found)))
  const clean = `<footer><div class="social">${icon('tel:+15550100100', 'fa-phone')}${icon('mailto:bake@crumb.example', 'fa-envelope')}${icon('https://instagram.com/crumb', 'fa-instagram')}</div></footer>`
  assert.deepEqual(channelLeftovers(ctxOf(pagesOf(clean))), [])
})

test('a summary block on every page with two channels is a finding; the contact page block with all of them is not', () => {
  // A dental clinic: two numbers and two mailboxes.
  const clinic = { business: { name: 'Bright Smile', address: '8 Molar Row, Toothbury' } }
  const summary =
    '<footer><h3>Get in touch</h3><a href="tel:+442079460101">+44 20 7946 0101</a><a href="tel:+447700900202">+44 7700 900 202</a>' +
    '<p>8 Molar Row, Toothbury</p><a href="mailto:hello@brightsmile.example">hello@brightsmile.example</a></footer>'
  const found = channelLeftovers(ctxOf(pagesOf(summary), clinic))
  assert.equal(found.filter((f) => /summary/.test(f.place)).length, 1)
  const one =
    '<footer><h3>Get in touch</h3><a href="tel:+442079460101">+44 20 7946 0101</a><p>8 Molar Row, Toothbury</p></footer>'
  const contactPage = {
    path: '/contact',
    html:
      '<main><h1>Contact</h1><a href="tel:+442079460101">+44 20 7946 0101</a><a href="tel:+447700900202">+44 7700 900 202</a>' +
      `<a href="mailto:hello@brightsmile.example">hello@brightsmile.example</a><a href="mailto:care@brightsmile.example">care@brightsmile.example</a></main>${one}`
  }
  assert.deepEqual(channelLeftovers(ctxOf([...pagesOf(one), contactPage], clinic)), [])
})

test('a summary block with a second location line beside the street address is a finding', () => {
  const brief = { ...bakery, business: { ...bakery.business, serviceAreas: ['Bakeries across Breadton'] } }
  const block =
    '<footer><h3>Visit</h3><a href="tel:+15550100100">+1 555 010 0100</a><p>4 Crumb Lane, Breadton</p><p>Bakeries across Breadton</p></footer>'
  const found = channelLeftovers(ctxOf(pagesOf(block), brief))
  assert.ok(found.some((f) => /location/.test(f.place)))
})

test('an address shown with a spaced dash between its parts is a finding; with commas it is not', () => {
  const brief = { business: { name: 'Bright Smile', address: 'Molar Row 8 - Old Quarter - Toothbury' } }
  const dashed = channelLeftovers(
    ctxOf(pagesOf('<footer><p>Molar Row 8 - Old Quarter - Toothbury</p></footer>'), brief)
  )
  assert.ok(dashed.some((f) => /address/.test(f.place)))
  const commas = channelLeftovers(
    ctxOf(pagesOf('<footer><p>Molar Row 8, Old Quarter, Toothbury</p></footer>'), brief)
  )
  assert.deepEqual(commas, [])
})

test('the check carries the kind: C22 in the report', () => {
  assert.ok(LEFTOVER_KINDS.C22)
  const row = `<footer>${icon('tel:+15550100100', 'fa-phone')}${icon('tel:+15550100101', 'fa-phone')}</footer>`
  const report = checkDemoLeftovers({ pages: pagesOf(row), brief: bakery })
  assert.ok(report.findings.some((f) => f.kind === 'C22'))
})
