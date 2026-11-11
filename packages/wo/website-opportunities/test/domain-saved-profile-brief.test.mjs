// The brief states the saved profile (#537 R18): what the owner switched off or edited on the Profile card is what the
// content brief writer reads, and Google's facts of the business are ordinary facts with ids that survive research.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBrief, validateBrief } from '../domain/brief.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { research } from './fixtures/saved-profile-research.mjs'

const ROOM = '11111111-1111-4111-8111-111111111111'
const base = placeProfileFromResearch(research())

function briefOf(candidate = {}) {
  const r = research()
  return buildBrief({
    opportunity: { id: 'o-lumen', name: 'Lumen Studio', candidate: { trade: 'fitness', ...candidate } },
    profile: r.profile,
    googlePlace: r.profile.googlePlace,
    sources: r.sources,
    media: r.media.map((m) => ({ ...m, sourceUrl: m.source_url })),
    posts: [],
    madeAt: '2026-11-05T00:00:00.000Z'
  })
}

test("Google's facts of the business sit in the business group, with ids that survive Research again", () => {
  assert.equal(base.business.editorialSummary.value, 'A light filled studio for daily yoga.')
  assert.equal(base.business.reservable.value, true)
  assert.deepEqual(base.business.amenities.value, {
    wheelchairAccessibleEntrance: true,
    freeParkingLot: false
  })
  assert.equal(base.business.hours.value.length, 2)
  // The editorial summary is a fact, no second quote; the summary a model wrote of the reviews stays a quote.
  assert.equal(base.quotes.filter((q) => q.value.attribution === 'Google').length, 1)
  const rating = base.claims.statistics.find((s) => s.value.label === 'rating')
  assert.equal(rating.value.amount, 4.8)
  // Research again with Google saying other things: the same ids, so the owner's switches and edits still apply.
  const again = research()
  Object.assign(again.profile.googlePlace, {
    summaries: { editorial: 'A calm studio.' },
    amenities: { wheelchairAccessibleEntrance: false },
    reservable: false,
    openingHours: ['Monday: closed'],
    rating: 4.6
  })
  const next = placeProfileFromResearch(again)
  for (const key of ['editorialSummary', 'reservable', 'amenities', 'hours'])
    assert.equal(next.business[key].id, base.business[key].id, key)
  assert.equal(next.claims.statistics.find((s) => s.value.label === 'rating').id, rating.id)
})

test('the brief states the saved values: switched off Google facts are not stated, edited ones read as edited', () => {
  const plain = briefOf()
  assert.equal(validateBrief(plain).ok, true)
  assert.deepEqual(plain.googlePlace.amenities, { wheelchairAccessibleEntrance: true, freeParkingLot: false })
  assert.equal(plain.googlePlace.reservable, true)
  assert.equal(plain.googlePlace.summaries.editorial, 'A light filled studio for daily yoga.')

  const at = '2026-11-04T00:00:00.000Z'
  const brief = briefOf({
    factOverrides: {
      [base.business.reservable.id]: { onSite: false, at },
      [base.business.editorialSummary.id]: { onSite: false, at }
    },
    factEdits: {
      [base.business.amenities.id]: { value: { wheelchairAccessibleEntrance: true }, at },
      [base.business.hours.id]: { value: ['Monday: 9:00 AM to 5:00 PM'], at },
      [base.business.address.id]: { value: '14 Example Lane, Sampletown', at },
      [base.offerings[0].id]: { value: 'Morning yoga', at }
    },
    teamEdits: { added: [{ id: 'te_ownabc', label: 'Ana Ruiz', role: 'Front desk' }], changed: {}, at },
    siteSocials: { tiktok: { url: 'https://www.tiktok.com/@lumen.example', at } },
    mediaPicks: { hidden: [ROOM] }
  })
  assert.equal(validateBrief(brief).ok, true, JSON.stringify(validateBrief(brief).errors))
  assert.deepEqual(brief.googlePlace.amenities, { wheelchairAccessibleEntrance: true })
  assert.equal('reservable' in brief.googlePlace, false)
  assert.equal('editorial' in brief.googlePlace.summaries, false)
  assert.deepEqual(brief.business.hours, ['Monday: 9:00 AM to 5:00 PM'])
  assert.equal(brief.business.address, '14 Example Lane, Sampletown')
  assert.equal(brief.business.socials.tiktok, 'https://www.tiktok.com/@lumen.example')
  assert.equal(
    brief.assets.some((a) => a.id === ROOM),
    false,
    'a hidden photo is no asset'
  )
  // A fact the owner edited says so, with the value research read beside it.
  const hours = brief.facts.find((f) => f.field === 'hours')
  assert.equal(hours.editedByOwner, true)
  assert.equal(hours.researchValue.length, 2)
  const service = brief.facts.find((f) => f.field === 'services')
  assert.equal(service.value.name, 'Morning yoga')
  // The person the owner added is on the team, not a researched fact.
  assert.ok(JSON.stringify(brief).includes('Ana Ruiz'))
  assert.equal(
    brief.facts.some((f) => f.id === 'fact_owner_te_ownabc'),
    false
  )
})
