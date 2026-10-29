// A contact fact the brief holds reaches the contact record, the contact modules and the leftover report (spec TracyHQ/tracy#189).
// A swim club with an address, areas and a place id; a bakery with areas only; a clinic with a two-line demo address; a florist with nothing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactSteps } from '../src/sites/brief-engines/joomla-tidy.js'
import { joomlaContactLinks } from '../src/sites/brief-engines/joomla-contact-links.js'
import { plannedAddressLines, plannedSlotValues } from '../src/sites/brief-engines/joomla-outside-map.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'
import { normalizeBrief } from '../src/sites/brief-normalize.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'

const door =
  (rows) =>
  async ({ action, params }) =>
    action === 'content.list' && params.kind === 'contact'
      ? { ok: true, items: params.offset ? [] : rows }
      : { ok: true, items: [] }
const oneLine = {
  id: 1,
  published: 1,
  language: '*',
  name: 'Demo',
  address: '1 Demo Way',
  suburb: '',
  telephone: ''
}
const twoLines = { ...oneLine, address: '1 Demo Way', suburb: 'Sampleton', misc: '<p>Demo hours</p>' }
const address = {
  value: 'Pier Nine - Old Quay - Portville - Exampleland',
  href: 'https://maps.google.com/?cid=1'
}
const area = { value: 'Locations across Portville' }
const steps = async (row, contact) =>
  (await contactSteps({ apply: door([row]), siteKey: 's', given: {}, visible: new Set(), contact })).steps[0]
    ?.fields ?? {}

test('(a) address and areas: the address as given, the record’s extra text takes the areas', async () => {
  const f = await steps(twoLines, { address, serviceArea: area })
  assert.equal(f.address, 'Pier Nine')
  assert.equal(f.suburb, 'Old Quay - Portville - Exampleland')
  assert.equal(f.misc, '<p>Locations across Portville</p>')
})

test('(b) areas only: the areas are the line, no street', async () => {
  const f = await steps(twoLines, { serviceArea: area })
  assert.equal(f.address, 'Locations across Portville')
  assert.equal(f.suburb, '')
})

test('(c) address only on a one-line record: the whole address, words untouched', async () => {
  const f = await steps(oneLine, { address })
  assert.equal(f.address, address.value)
})

test('(d) nothing given: the demo lines go', async () => {
  const f = await steps(twoLines, null)
  assert.equal(f.address, '')
  assert.equal(f.suburb, '')
})

const plan = {
  slots: [
    {
      key: 'module-5.1',
      role: 'contact.address',
      decision: 'value',
      reason: 'contact-fact',
      value: address.value
    },
    {
      key: 'contact-1.1',
      role: 'contact.address',
      decision: 'value',
      reason: 'contact-fact',
      value: address.value
    }
  ]
}

test('the address line of a contact block is a planned slot value; a contact record’s own is left to the record step', () => {
  assert.deepEqual(plannedAddressLines(plan), { 'module-5.1': address.value })
  assert.equal(plannedSlotValues(plan)['module-5.1'], address.value)
})

test('a module gets the areas beside the address and its map link on the business pin, once', () => {
  const html = '<p class="mb-3">Old Street 1</p><a href="#" class="btn">Get directions</a>'
  const out = joomlaContactLinks(html.replace('Old Street 1', address.value), { address, serviceArea: area })
  assert.match(out.html, /<p class="mb-3">Locations across Portville<\/p>/)
  assert.match(out.html, /href="https:\/\/maps\.google\.com\/\?cid=1"/)
  assert.equal(joomlaContactLinks(out.html, { address, serviceArea: area }).html, out.html)
  // No pin in the brief: the template's link is left for the leftover check, never invented.
  assert.match(joomlaContactLinks(html, { serviceArea: area }).html, /href="#"/)
})

test('a listing address with spaced dashes is an address; a city alone is not', async () => {
  const brief = (value) => ({ about: 'x', facts: { address: { value, source: 'business.address' } } })
  assert.equal(
    (await normalizeBrief({ brief: brief(address.value), label: 'l', model: null })).address,
    address.value
  )
  assert.equal((await normalizeBrief({ brief: brief('Portville'), label: 'l', model: null })).address, '')
})

test('the leftover report names a contact fact the built site does not show', async () => {
  const { checkContactFacts } = await websiteOpportunitiesDomain()
  const brief = { business: { address: address.value, email: 'swim@club.example' } }
  const report = await runLeftoverCheck({
    readPage: async () => ({
      status: 200,
      html: '<p>Pier Nine</p><p>Old Quay - Portville - Exampleland</p>'
    }),
    check: () => ({ pass: true, findings: [], counts: {} }),
    contactCheck: checkContactFacts,
    contentMap: {},
    brief
  })
  assert.deepEqual(
    report.contactMissing.map((m) => m.kind),
    ['email']
  )
})
