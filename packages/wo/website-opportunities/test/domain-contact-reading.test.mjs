// The one reader of a brief's contact facts, its address lines, map link and the check that a fact is on the built site
// (spec TracyHQ/tracy#189). Both businesses are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addressLines, mapsLinkOf, readContact } from '../domain/contact-reading.mjs'
import { checkContactFacts } from '../domain/contact-fact-check.mjs'
import { planSite } from '../domain/site-plan.mjs'

const coaching = {
  business: {
    name: 'Harbour Swim Club',
    phone: '+1 555 010 2000',
    address: 'Pier Nine - Old Quay - Portville - Exampleland',
    serviceAreas: [{ text: 'Locations across Portville', quote: 'x', source: {} }]
  },
  contact: { whatsapp: { number: '+1 555 010 2000' } },
  googlePlace: {
    placeId: 'ChIJexample0000000000000001',
    googleMapsUri: 'https://maps.google.com/?cid=123456789'
  }
}

test('every place a fact can sit in is read, and the sources are named', () => {
  const c = readContact(coaching)
  assert.equal(c.address.value, 'Pier Nine - Old Quay - Portville - Exampleland')
  assert.equal(c.address.source, 'business.address')
  assert.equal(c.serviceArea.value, 'Locations across Portville')
  const other = readContact({
    googlePlace: { formattedAddress: '4 Crumb Lane, Breadton' },
    contact: { email: 'hi@crumbs.example' }
  })
  assert.equal(other.address.value, '4 Crumb Lane, Breadton')
  assert.equal(other.email.value, 'hi@crumbs.example')
  assert.deepEqual(readContact({ business: { name: 'x' } }), {})
})

test('the map link is the exact pin: maps link, place id, coordinates, then an address search', () => {
  assert.equal(mapsLinkOf(coaching).via, 'maps-uri')
  const noUri = {
    business: { address: '4 Crumb Lane' },
    googlePlace: { placeId: 'ChIJexample0000000000000001' }
  }
  assert.match(mapsLinkOf(noUri).value, /query_place_id=ChIJexample/)
  assert.equal(mapsLinkOf({ business: { location: { lat: 1.5, lng: 2.5 } } }).via, 'coordinates')
  assert.match(
    mapsLinkOf({ business: { address: '4 Crumb Lane, Breadton' } }).value,
    /query=4%20Crumb%20Lane%2C%20Breadton/
  )
  assert.equal(mapsLinkOf({ business: {} }), null)
})

test('an address is cut only where the brief separates it, never reworded', () => {
  const a = 'Pier Nine - Old Quay - Portville - Exampleland'
  assert.deepEqual(addressLines(a, 1), [a])
  assert.deepEqual(addressLines(a, 2), ['Pier Nine', 'Old Quay - Portville - Exampleland'])
  assert.deepEqual(addressLines('4 Crumb Lane, Breadton, Exampleland', 2), [
    '4 Crumb Lane',
    'Breadton, Exampleland'
  ])
  assert.deepEqual(addressLines('Somewhere', 3), ['Somewhere'])
})

test('the check names a contact fact no page shows, and stays quiet when it is shown', () => {
  const brief = {
    business: {
      address: 'Pier Nine - Old Quay - Portville',
      phone: '+1 555 010 2000',
      email: 'swim@club.example'
    }
  }
  const page = '<p>Pier Nine</p><p>Old Quay - Portville</p><a href="tel:+15550102000">Call</a>'
  const missing = checkContactFacts({ pages: [{ path: '/', html: page }], brief })
  assert.deepEqual(
    missing.map((m) => m.kind),
    ['email']
  )
  assert.deepEqual(
    checkContactFacts({
      pages: [{ path: '/', html: `${page}<a href="mailto:swim@club.example">x</a>` }],
      brief
    }),
    []
  )
})

// The slot decisions of the site plan: address + areas, areas only, address only, nothing.
const map = { slots: [{ key: 'module-1.0', type: 'text', role: 'contact.address' }], entities: [], pages: [] }
const served = { set: { contentHash: 'c'.repeat(64) }, questions: [] }
const slotOf = (brief) => planSite(brief, served, { now: '2026-10-29T00:00:00Z', contentMap: map }).slots[0]

test('plan: an address is shown as given and links to its pin', () => {
  assert.equal(slotOf(coaching).value, 'Pier Nine - Old Quay - Portville - Exampleland')
  const plan = planSite(coaching, served, { now: '2026-10-29T00:00:00Z', contentMap: map })
  assert.equal(plan.contact.address.href, 'https://maps.google.com/?cid=123456789')
  assert.equal(plan.contact.serviceArea.value, 'Locations across Portville')
})

test('plan: only service areas fill the address slot; nothing leaves it to the take-off rule', () => {
  const onlyAreas = { business: { name: 'Crumbs', serviceAreas: coaching.business.serviceAreas } }
  assert.equal(slotOf(onlyAreas).value, 'Locations across Portville')
  assert.notEqual(slotOf({ business: { name: 'Crumbs' } }).decision, 'value')
})
