// What the owner typed about the business is held to the offer rules (#609 defects of a real run): a phrase saying what
// the business is, or who it serves, is no service; a near duplicate joins the owner's more precise service; a real
// service only the owner names still arrives. Each drop is recorded with its code. An invented rowing club, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-offer-shape.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { ownerShapeDropOf } from '../domain/owner-offer-shape.mjs'

const NAME = 'Ottermere Rowing Club'
const STATEMENT = `I run ${NAME}, a rowing club. We also run junior lessons for kids on weekdays and rent boat storage.`
const WEB = `${NAME}. Sculling courses for every level.`

test('a phrase that says what the business is, or who it serves, is no service; a real offer stays', () => {
  assert.equal(ownerShapeDropOf('rowing club', STATEMENT), 'owner_item_describes_business')
  assert.equal(ownerShapeDropOf('rowing club', 'We are a rowing club.'), 'owner_item_describes_business')
  assert.equal(ownerShapeDropOf('kids', STATEMENT), 'owner_item_describes_audience')
  assert.equal(ownerShapeDropOf('junior lessons', STATEMENT), null)
  assert.equal(ownerShapeDropOf('boat storage', STATEMENT), null)
  assert.equal(ownerShapeDropOf('junior club', 'We also run a junior club for teens.'), null)
})

const offer = (name, evidence, source = 'owner-statement') => ({
  source,
  kind: 'service',
  fields: { 'offering.name': name },
  evidence
})
const research = {
  sources: [
    { id: 'website', origin: 'website', text: WEB },
    { id: 'owner-statement', origin: 'answer', text: STATEMENT }
  ]
}

test('the needs profile keeps one owner service per offer and records each one it set aside', () => {
  const profile = needsProfileOf(research, {
    items: [
      offer('Sculling courses', 'Sculling courses for every level.', 'website'),
      offer('rowing club', `${NAME}, a rowing club.`),
      offer('junior lessons', 'We also run junior lessons for kids on weekdays'),
      offer('junior lessons for kids', 'We also run junior lessons for kids on weekdays'),
      offer('boat storage', 'rent boat storage')
    ]
  })
  const names = profile.items.service.map((i) => i.fields['offering.name'].value)
  assert.deepEqual(names, ['Sculling courses', 'junior lessons for kids', 'boat storage'])
  const owner = profile.dropped.filter(
    (d) => d.source === 'owner-statement' && d.code?.startsWith('owner_item')
  )
  assert.deepEqual(
    owner.map((d) => [d.code, d.value, d.keptAs ?? null]),
    [
      ['owner_item_describes_business', 'rowing club', null],
      ['owner_item_near_duplicate', 'junior lessons', 'junior lessons for kids']
    ]
  )
  for (const d of owner) assert.match(d.reason, /^the owner /)
})

test('a service the website names is never touched by the owner rules', () => {
  const web = `${NAME}, a rowing club. Rowing club lessons for juniors.`
  const own = { sources: [{ id: 'website', origin: 'website', text: web }, research.sources[1]] }
  const profile = needsProfileOf(own, {
    items: [
      offer('rowing club', `${NAME}, a rowing club.`, 'website'),
      offer('Rowing club lessons', 'Rowing club lessons for juniors.', 'website')
    ]
  })
  assert.equal(profile.items.service.length, 2)
})

test('the business reading drops an owner service that describes the business, on the record', () => {
  const sources = readingSourcesOf({
    name: NAME,
    websitePages: [{ url: 'https://ottermere.example.test/', title: NAME, text: WEB }],
    ownerStatement: STATEMENT
  })
  const read = checkBusinessReading(
    {
      services: [
        { name: 'Sculling courses', quote: 'Sculling courses for every level.', ref: 'website:1:1' },
        { name: 'rowing club', quote: 'a rowing club', ref: 'owner' },
        { name: 'junior lessons', quote: 'junior lessons for kids on weekdays', ref: 'owner' },
        { name: 'junior lessons for kids', quote: 'junior lessons for kids on weekdays', ref: 'owner' }
      ]
    },
    sources,
    { trade: 'other' }
  )
  const fromOwner = read.services.filter((s) => s.source.kind === 'owner-statement').map((s) => s.label)
  assert.deepEqual(fromOwner, ['junior lessons for kids'])
  assert.deepEqual(
    read.ownerItemsDropped.map((d) => [d.label, d.why]),
    [
      ['rowing club', 'owner_item_describes_business'],
      ['junior lessons', 'owner_item_near_duplicate']
    ]
  )
})
