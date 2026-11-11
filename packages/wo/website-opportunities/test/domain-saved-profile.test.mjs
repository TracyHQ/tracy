import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { factDecisions } from '../domain/fact-assessment.mjs'
import { reviewKeyOf } from '../domain/owner-site-picks.mjs'
import { factWithPathOf, savedProfileOf, stampDecisions } from '../domain/saved-profile.mjs'
import { research, REVIEW } from './fixtures/saved-profile-research.mjs'

const ROOM = '11111111-1111-4111-8111-111111111111'
const PHOTO = '33333333-3333-4333-8333-333333333333'
const input = research()
const base = placeProfileFromResearch(input)
const read = { research: input.profile, media: input.media }

/** A candidate holding one pick of every kind the Profile card stores. */
function everyPick() {
  return {
    factOverrides: {
      [base.business.phone.id]: { onSite: false, at: '2026-11-02T00:00:00.000Z' },
      band_reviews: { onSite: false, at: '2026-11-02T00:00:00.000Z' }
    },
    factEdits: {
      [base.business.hours.id]: { value: ['Monday: 9:00 AM to 5:00 PM'], at: '2026-11-03T00:00:00.000Z' },
      [base.business.amenities.id]: {
        value: { wheelchairAccessibleEntrance: true },
        at: '2026-11-03T00:00:00.000Z'
      },
      [base.offerings[0].id]: { value: 'Morning yoga', at: '2026-11-03T00:00:00.000Z' },
      [base.links[0].id]: {
        value: 'https://www.instagram.com/lumen.yoga.example',
        at: '2026-11-03T00:00:00.000Z'
      }
    },
    teamEdits: {
      added: [{ id: 'te_ownabc', label: 'Ana Ruiz', role: 'Front desk', photoMediaId: PHOTO }],
      changed: { tm_mira: { label: 'Mira H.', role: null } },
      at: '2026-11-04T00:00:00.000Z'
    },
    siteSocials: { tiktok: { url: 'https://www.tiktok.com/@lumen.example', at: '2026-11-04T00:00:00.000Z' } },
    mediaPicks: { hidden: [ROOM] },
    reviewPicks: { hidden: [reviewKeyOf(REVIEW)] }
  }
}

test('every pick the Profile card stores is laid on the place profile', () => {
  const saved = savedProfileOf(everyPick(), base, read)
  // On and off: the owner's answer on the fact itself, the band beside the facts.
  assert.equal(saved.business.phone.onSite, false)
  assert.equal(saved.business.phone.decidedBy, 'owner')
  assert.deepEqual(saved.owner.bands, {
    brand: true,
    keyMessages: true,
    reviews: false,
    media: true,
    socials: true
  })
  // Value edits: the owner's value, the research's kept beside it.
  assert.deepEqual(saved.business.hours.value, ['Monday: 9:00 AM to 5:00 PM'])
  assert.deepEqual(saved.business.hours.researchValue, base.business.hours.value)
  assert.equal(saved.business.hours.editedByOwner, true)
  assert.equal(saved.business.hours.editedAt, '2026-11-03T00:00:00.000Z')
  assert.deepEqual(saved.business.amenities.value, { wheelchairAccessibleEntrance: true })
  assert.equal(saved.offerings[0].value.name, 'Morning yoga')
  assert.equal(saved.offerings[0].value.kind, 'class', 'a record keeps every part but the edited one')
  assert.equal(saved.links[0].value.url, 'https://www.instagram.com/lumen.yoga.example')
  // The team: a person research read renamed with the role cleared, keyed by the reading's id; one the owner added.
  const mira = saved.people.find((p) => p.teamMemberId === 'tm_mira')
  assert.deepEqual(mira.value, { name: 'Mira H.', relationship: 'team' })
  assert.deepEqual(mira.researchValue, { name: 'Mira', relationship: 'team', role: 'Coach' })
  const ana = saved.people.find((p) => p.addedByOwner)
  assert.equal(ana.id, 'fact_owner_te_ownabc')
  assert.deepEqual(ana.value, { name: 'Ana Ruiz', relationship: 'team', role: 'Front desk' })
  assert.equal(ana.photoMediaId, PHOTO)
  assert.ok(saved.evidence.some((e) => ana.evidenceRefs.includes(e.id) && e.sourceId === 'source_owner'))
  // A link typed for the site is a fact of its own.
  const tiktok = saved.links.find((l) => l.id === 'fact_owner_social_tiktok')
  assert.deepEqual(tiktok.value, { kind: 'tiktok', url: 'https://www.tiktok.com/@lumen.example' })
  assert.equal(tiktok.siteSocial, true)
  // Hidden photos and reviews: marked, keyed by the ids their doors take.
  const room = saved.media.find((m) => m.mediaId === ROOM)
  assert.equal(room.ownerHidden, true)
  assert.equal(saved.media.find((m) => m.mediaId !== ROOM).ownerHidden, undefined)
  const review = saved.quotes.find((q) => q.value.text === REVIEW.text)
  assert.equal(review.reviewKey, reviewKeyOf(REVIEW))
  assert.equal(review.ownerHidden, true)
  assert.deepEqual(saved.owner.hiddenMediaIds, [ROOM])
})

test('the saved profile is idempotent and leaves its inputs untouched', () => {
  const picks = everyPick()
  const before = structuredClone({ picks, base, read })
  const once = savedProfileOf(picks, base, read)
  assert.deepEqual(savedProfileOf(picks, once, read), once)
  assert.deepEqual({ picks, base, read }, before)
  // Without picks it is the research, with the owner's block beside and the keys its doors take.
  const plain = savedProfileOf({}, base, read)
  assert.deepEqual(plain.business, base.business)
  assert.equal(plain.people[0].teamMemberId, 'tm_mira')
})

test('the assessment reads the owner choice the saved profile carries; stampDecisions puts every decision on its fact', () => {
  const saved = savedProfileOf(everyPick(), base, read)
  const decided = factDecisions(saved)
  assert.deepEqual(
    { onSite: decided.get(base.business.phone.id).onSite, by: decided.get(base.business.phone.id).decidedBy },
    { onSite: false, by: 'owner' }
  )
  const stamped = stampDecisions(saved, decided)
  assert.equal(stamped.business.name.decidedBy, 'rule')
  assert.equal(typeof stamped.business.name.onSite, 'boolean')
  assert.equal(stamped.business.phone.onSite, false)
  assert.ok(Array.isArray(stamped.business.name.reasons))
  assert.equal(factWithPathOf(stamped, base.business.hours.id).path.join('.'), 'business.hours')
})

test('a value edit naming no fact, or a fact of no kind, changes nothing', () => {
  const saved = savedProfileOf(
    { factEdits: { fact_gone: { value: 'x', at: 'now' }, [base.business.name.id]: { value: 'Lumen Yoga' } } },
    base,
    read
  )
  assert.equal(saved.business.name.value, 'Lumen Yoga')
  assert.equal(JSON.stringify(saved).includes('fact_gone'), false)
})
