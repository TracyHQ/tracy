// The place choice of the build chat's research (#609, `build-draft/gather.js`): a Google link that matches more than
// one place (two branches under one name) is asked about before anything else is read; the owner's pick is read with
// the same place details reader as an unambiguous link, and "None of these" goes on without the link, as before. The
// gatherer as the app wires it, with only the network doors faked. Every place here is invented; no place id is real.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather-place-choice.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchOf } from 'website-opportunities/domain'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
import {
  MAPS,
  SITE,
  connector,
  fakeDomain,
  placeDetails,
  runtimeWith,
  websiteResult
} from './build-draft-gather-fakes.mjs'

const NORTH = 'ChIJinventedNorth01'
const SOUTH = 'ChIJinventedSouth02'
const BRANCHES = [
  {
    provider: 'google-places',
    providerId: NORTH,
    name: 'Hollowmere Bakehouse',
    address: '12 Quillan Lane, Brackenford'
  },
  {
    provider: 'google-places',
    providerId: SOUTH,
    name: 'Hollowmere Bakehouse',
    address: '4 Fernwick Road, Brackenford'
  }
]
const WORDS = 'https://www.google.com/maps/search/?api=1&query=Hollowmere+Bakehouse'

/** The invented bakery with two branches of one name: a text search finds both, a place id search the one. */
async function twoBranches() {
  const { domain, calls } = await fakeDomain({
    connectors: { website: connector(websiteResult()) },
    details: (id) => ({
      ...placeDetails(),
      id,
      formattedAddress: BRANCHES.find((b) => b.providerId === id)?.address,
      regularOpeningHours: { weekdayDescriptions: [`Monday: hours of ${id}`] }
    })
  })
  domain.searchNamedPlaces = async (query) => {
    calls.push(['search', query])
    const one = BRANCHES.find((b) => b.providerId === query?.placeId)
    return { candidates: one ? [one] : BRANCHES }
  }
  return { domain, calls }
}

const gatherer = (domain) =>
  preSiteGatherer({
    pool: null,
    config: null,
    overrides: {
      loadDomain: async () => domain,
      runtime: runtimeWith({ google: 'google-test' }),
      fetch: async () => assert.fail('no fetch outside the fakes'),
      paidRunAllowed: async () => true
    }
  })

test('an ambiguous Google link asks which place is the owner, both branches and None of these, before reading', async () => {
  const { domain, calls } = await twoBranches()
  const error = await gatherer(domain)({ links: [WORDS, SITE], description: null }).then(
    () => assert.fail('the research asks first'),
    (e) => e
  )
  assert.equal(error.code, 'place_ambiguous')
  assert.equal(error.noRerun, true)
  const { question } = error.details
  assert.equal(question.topic, 'place-choice')
  assert.equal(
    question.prompt,
    'We found more than one place on Google Maps under this name. Which one is yours?'
  )
  assert.deepEqual(
    question.choices.map((c) => [c.id, c.label]),
    [
      [NORTH, 'Hollowmere Bakehouse, 12 Quillan Lane, Brackenford'],
      [SOUTH, 'Hollowmere Bakehouse, 4 Fernwick Road, Brackenford'],
      ['none', 'None of these']
    ]
  )
  // Nothing was read yet: no place details, no website crawl.
  assert.equal(
    calls.some((c) => c[0] === 'details'),
    false
  )
})

test('the picked branch is read with the place details reader: a Google source with that place facts', async () => {
  const { domain, calls } = await twoBranches()
  const { brief, setAside } = await gatherer(domain)({
    links: [WORDS, SITE],
    description: null,
    place: BRANCHES[1]
  })
  assert.deepEqual(setAside, [])
  assert.deepEqual(
    calls.filter((c) => c[0] === 'details'),
    [['details', SOUTH, true]]
  )
  assert.equal(brief.googlePlace?.placeId, SOUTH)
  const { sources } = researchOf(brief, { manifest: [] })
  const google = sources.find((s) => s.id === 'google')
  assert.ok(google, 'a Google source')
  assert.match(google.fields['contact.hours'], new RegExp(SOUTH))
})

test('None of these: the link is set aside as before, the other links still read, no Google source', async () => {
  const { domain } = await twoBranches()
  const { brief, setAside } = await gatherer(domain)({
    links: [WORDS, SITE],
    description: null,
    place: 'none'
  })
  assert.deepEqual(setAside, [{ link: WORDS, reason: 'the Google link matches more than one place' }])
  assert.equal(brief.googlePlace ?? null, null)
  assert.equal(brief.business.name, 'Hollowmere Bakehouse')
})

test('an unambiguous Google link asks nothing', async () => {
  const { domain } = await fakeDomain()
  const { brief, setAside } = await gatherer(domain)({ links: [MAPS], description: null })
  assert.deepEqual(setAside, [])
  assert.ok(brief.googlePlace?.placeId)
})
