// Several photos tied to one item, from two sources, with a map provider's long photo reference (#575): the research's
// vision ties three of four services and the head coach to photos on the map listing and on the social profile. The
// step chain never made a fact of such a tie: `photo-shortlist.js` `sameService` only ranks a photo first for its
// offering's frame, and `portraitsOf` picks a person's portrait at placement, by the asset id. So two photos of one
// offering are never a disagreement for the owner to settle: one goes on the item, the others stay own photos of the
// gallery, and no photo reference ever reaches a plan fact, an assumption or its alternatives (the 200 character
// limit of `facts[].value` stays as it is). Invented club, invented references.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-tied-pictures-many.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TEXT_LIMITS } from '../domain/build-contract-shapes.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { isPictureRole } from '../domain/needs-profile-merge.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { ownPicturesOf } from '../domain/picture-frames.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  clubResearch,
  goodComposition,
  library,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

/** An invented map provider photo reference of about 490 characters, as long as the real ones. */
const mapRef = (id) =>
  `example-maps:places/InventedPlaceBrindlewick/photos/${`${id}Zq8LwT3vK`.repeat(60)}`.slice(0, 490)
/** An invented social picture address of about 680 characters. */
const socialRef = (id) =>
  `https://cdn.social.example/v/brindlewick/${id}.jpg?sig=${`${id}Hn4Pq`.repeat(120)}`.slice(0, 680)

const tie = (id, ref, link) => ({ id, ref, ...link })
const depicts = (id) => ({ depicts: id })
const portraitOf = (id) => ({ portraitOf: id })

/** The invented club with typed items and photos tied to them by the research's vision, on two sources. */
function tiedClub() {
  const club = clubResearch()
  const [site, gmaps, insta] = club.research.sources
  site.items = [
    { id: 'svc-junior', kind: 'service', fields: { 'offering.name': 'Junior coaching' } },
    { id: 'svc-adult', kind: 'service', fields: { 'offering.name': 'Adult group lessons' } },
    { id: 'svc-court', kind: 'service', fields: { 'offering.name': 'Court hire' } },
    { id: 'svc-cardio', kind: 'service', fields: { 'offering.name': 'Cardio tennis' } },
    { id: 'team-ilse', kind: 'person', fields: { 'person.name': 'Ilse Varrow', 'person.role': 'Head coach' } }
  ]
  gmaps.pictures.push(
    tie('g-j1', mapRef('g-j1'), depicts('svc-junior')),
    tie('g-j2', mapRef('g-j2'), depicts('svc-junior')),
    tie('g-a1', mapRef('g-a1'), depicts('svc-adult')),
    tie('g-c1', mapRef('g-c1'), depicts('svc-court')),
    tie('g-p1', mapRef('g-p1'), portraitOf('team-ilse'))
  )
  insta.pictures.push(
    tie('i-j1', socialRef('i-j1'), depicts('svc-junior')),
    tie('i-a1', socialRef('i-a1'), depicts('svc-adult')),
    tie('i-a2', socialRef('i-a2'), depicts('svc-adult')),
    tie('i-p1', socialRef('i-p1'), { ...portraitOf('team-ilse'), portraitOnly: true })
  )
  return club
}
const tiedProfile = () => {
  const club = tiedClub()
  return needsProfileOf(club.research, club.reading)
}
const contextOf = (profile) =>
  composerContextOf({
    profile,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const serviceNamed = (profile, name) =>
  profile.items.service.find((i) => i.fields['offering.name'].value === name)

test('two photos of one offering are never a conflict, and no question or plan line asks about them', () => {
  const profile = tiedProfile()
  const pictureConflicts = profile.conflicts.filter((c) => isPictureRole(c.kind))
  assert.deepEqual(pictureConflicts, [])
  assert.ok(!profile.questions.some((q) => isPictureRole(q.fact ?? '')))
  const context = contextOf(profile)
  assert.ok(
    !context.assumptions.some((a) => (a.alternatives ?? []).some((v) => v.value.includes('example-')))
  )
})

test('the most trusted tied photo goes on its offering and its person, the others stay in the gallery', () => {
  const profile = tiedProfile()
  assert.equal(serviceNamed(profile, 'Junior coaching').fields['offering.image'].value, mapRef('g-j1'))
  assert.equal(serviceNamed(profile, 'Adult group lessons').fields['offering.image'].value, mapRef('g-a1'))
  assert.equal(serviceNamed(profile, 'Court hire').fields['offering.image'].value, mapRef('g-c1'))
  assert.equal(serviceNamed(profile, 'Cardio tennis').fields['offering.image'], undefined)
  const coach = profile.items.person.find((i) => i.fields['person.name'].value === 'Ilse Varrow')
  assert.equal(coach.fields['person.image'].value, mapRef('g-p1'))
  const gallery = profile.items.gallery.map((g) => g.fields['business.gallery_image'].value)
  for (const extra of [mapRef('g-j2'), socialRef('i-j1'), socialRef('i-a1'), socialRef('i-a2')])
    assert.ok(gallery.includes(extra), 'a second photo of an offering is still an own photo of the gallery')
  // A second portrait is never a gallery photo (the step chain never uses a portrait as any real photo).
  assert.ok(!gallery.includes(socialRef('i-p1')))
  assert.ok(profile.dropped.some((d) => d.code === 'second_portrait' && d.picture === 'i-p1'))
})

test('the picture step still finds each tied photo on its own offering and person', () => {
  const profile = tiedProfile()
  const records = ownPicturesOf(contextOf(profile).data)
  const junior = serviceNamed(profile, 'Junior coaching')
  const court = serviceNamed(profile, 'Court hire')
  assert.equal(records.find((r) => r.id === `${junior.id}:offering.image`)?.ref, mapRef('g-j1'))
  assert.equal(records.find((r) => r.id === `${court.id}:offering.image`)?.ref, mapRef('g-c1'))
  const coach = profile.items.person.find((i) => i.fields['person.name'].value === 'Ilse Varrow')
  assert.equal(records.find((r) => r.id === `${coach.id}:person.image`)?.ref, mapRef('g-p1'))
})

test('no plan fact or alternative carries a picture reference, and the composed plan passes the gate', () => {
  const context = contextOf(tiedProfile())
  const limit = TEXT_LIMITS['facts[].value']
  for (const fact of context.data.facts) {
    assert.ok(!isPictureRole(fact.kind), `${fact.id} is a picture`)
    assert.ok(fact.value.length <= limit, `${fact.id} is ${fact.value.length} characters`)
  }
  for (const a of context.assumptions)
    for (const alt of a.alternatives ?? []) assert.ok(alt.value.length <= limit, a.id)
  const result = gatePlan(goodComposition(), context)
  assert.deepEqual(
    result.problems.filter((p) => p.code === 'contract_b'),
    []
  )
})

test('a picture conflict that reaches the plan anyway is never a plan fact or an assumption (guard)', () => {
  const profile = clubProfile()
  const court = profile.items.service.find((i) => i.fields['offering.name'].value === 'Court hire')
  const [first, second] = profile.sources
  court.fields['offering.image'] = {
    value: mapRef('x1'),
    sources: [first.id],
    confidence: 'single-source',
    conflict: 'conflict-picture'
  }
  profile.conflicts.push({
    id: 'conflict-picture',
    kind: 'offering.image',
    at: `items.service.${court.id}.offering.image`,
    values: [
      { value: mapRef('x1'), sources: [first.id], origins: [first.origin] },
      { value: mapRef('x2'), sources: [second.id], origins: [second.origin] }
    ],
    default: mapRef('x1'),
    defaultBy: 'trust-order',
    chosen: null
  })
  const context = contextOf(profile)
  assert.ok(!context.data.facts.some((f) => f.id === `${court.id}-offering-image`))
  assert.ok(!context.assumptions.some((a) => a.id === 'conflict-picture'))
  const result = gatePlan(goodComposition(), context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
})
