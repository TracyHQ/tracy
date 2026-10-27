/**
 * The place profile a revision's slots are filled from (ADR 0037): the profile and assessment the revision froze when it
 * has them, read at read time from its research only for a revision made before the freeze.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as domain from 'website-opportunities/domain'
import { agentSlotFillOf } from '../src/opportunities-build/agent-slot-fill.js'
import { placeProfileOfRevision } from '../src/opportunities-build/place-profile-of-revision.js'
import { freezePlaceProfile } from '../src/opportunities-build/profile-revision.js'
import { slotRolesOf } from '../src/lib/slot-roles.js'

const AT = '2026-10-26T10:00:00.000Z'
const TRACY_BASE_J6 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5'
)

/** The research the brief froze for a gym: what a revision made before the freeze is read from. */
const snapshot = (name) => ({
  at: AT,
  opportunity: { provider: 'google', provider_id: 'iron-gym', name },
  profile: {
    name,
    phone: '+84 28 5555 0134',
    googlePlace: { placeId: 'iron-gym', primaryType: 'gym', types: ['gym'] }
  },
  menu: { items: [] },
  brand: {},
  sources: [],
  media: [],
  posts: []
})

/** A revision whose column froze a profile named `frozenName`, while its brief's research says another name. */
function frozenRevision(frozenName = 'Iron Gym District 1') {
  const research = snapshot(frozenName)
  return {
    brief: { sitemap: [], agentDemoSnapshot: snapshot('Iron Gym (research read later)') },
    place_profile: freezePlaceProfile({ research, at: AT })
  }
}

const nameOf = (placed) => placed.profile.business.name.value
const statusOf = (placed, factId) => placed.assessment.find((a) => a.factId === factId)?.status

test('a revision that froze its profile is read from that profile and its assessment, not from its research', () => {
  const revision = frozenRevision()
  const placed = placeProfileOfRevision(domain, revision)
  assert.equal(nameOf(placed), 'Iron Gym District 1')
  assert.deepEqual(placed.profile, revision.place_profile.profile)
  assert.deepEqual(placed.assessment, revision.place_profile.assessment.facts)
  assert.equal(placed.provisional, false)
  assert.equal(placed.note, undefined)
})

test('the frozen verdict is the one used: a fact the freeze withheld is not accepted later', () => {
  const revision = frozenRevision()
  const nameFact = revision.place_profile.profile.business.name.id
  revision.place_profile.assessment.facts = revision.place_profile.assessment.facts.map((a) =>
    a.factId === nameFact ? { ...a, status: 'withheld', reasonCodes: ['not-on-demo'] } : a
  )
  const placed = placeProfileOfRevision(domain, revision)
  assert.equal(statusOf(placed, nameFact), 'withheld')
})

test('an assessment made for another profile hash is no assessment: no fact is accepted, and a note says why', () => {
  const revision = frozenRevision()
  revision.place_profile.assessment.profileHash = '0'.repeat(64)
  const placed = placeProfileOfRevision(domain, revision)
  assert.equal(nameOf(placed), 'Iron Gym District 1')
  assert.deepEqual(placed.assessment, [])
  assert.equal(placed.provisional, false)
  assert.match(placed.note, /assessment-profile-hash-mismatch/)
  const plan = domain.planSlotFill({
    slotRoles: slotRolesOf(TRACY_BASE_J6).doc,
    profile: placed.profile,
    assessment: placed.assessment,
    locale: 'en',
    neutralFor: domain.neutralFor
  })
  assert.equal(
    plan.writes.filter((w) => w.state === 'sourced').length,
    0,
    'nothing unassessed reaches the page'
  )
})

test('a revision made before the freeze (no column) keeps the provisional read of its research', () => {
  const revision = { brief: { sitemap: [], agentDemoSnapshot: snapshot('Iron Gym') }, place_profile: null }
  const placed = placeProfileOfRevision(domain, revision)
  assert.equal(nameOf(placed), 'Iron Gym')
  assert.equal(placed.provisional, true)
  assert.equal(statusOf(placed, placed.profile.business.name.id), 'accepted')
})

test('the agent demo’s group plan reads the frozen profile, and says when its assessment names another one', async () => {
  const onTracyBase = (revision) => ({
    ...revision,
    cms: 'joomla',
    template: { quickstart: 'tracy-base/j6', version: '1.0.5' }
  })
  const held = await agentSlotFillOf(onTracyBase(frozenRevision()), 'profile')
  assert.equal(held.slotFill.state, 'ready')
  assert.equal(held.slotFill.provisional, false)
  assert.equal(held.slotFill.profileNote, undefined)
  assert.equal(nameOf(held.placeProfile), 'Iron Gym District 1')
  const other = frozenRevision()
  other.place_profile.assessment.profileHash = 'f'.repeat(64)
  const mismatched = await agentSlotFillOf(onTracyBase(other), 'catalogue')
  assert.match(mismatched.slotFill.profileNote, /assessment-profile-hash-mismatch/)
  assert.equal(mismatched.slotFill.counts.sourced, 0)
})

const PHIN_SHA = 'a'.repeat(64)
/** A cafe whose research read three drinks and dishes, and one website photo its caption names "Phin sữa đá". */
const cafeResearch = () => ({
  opportunity: {
    provider: 'google',
    provider_id: 'cafe-phin',
    name: 'Cà Phê Phin',
    candidate: { trade: 'food' }
  },
  profile: {
    name: 'Cà Phê Phin',
    phone: '+84 28 5555 0134',
    googlePlace: { placeId: 'cafe-phin', primaryType: 'cafe', types: ['cafe'] },
    menuItems: [
      // No source: the brief leaves it out, the profile keeps it — the two lists are not aligned by index.
      { name: 'Trà đá', price: '5.000', section: 'Đồ uống' },
      {
        name: 'Bánh mì trứng',
        price: '25.000',
        section: 'Đồ ăn',
        source: { kind: 'page', url: 'https://caphebrewlet.example/menu' }
      },
      {
        name: 'Phin sữa đá',
        price: '35.000',
        section: 'Cà phê',
        source: { kind: 'page', url: 'https://caphebrewlet.example/menu' }
      }
    ]
  },
  brand: {},
  sources: [],
  media: [
    {
      id: 'm-phin',
      kind: 'image',
      status: 'stored',
      category: 'food',
      sha256: PHIN_SHA,
      source: 'website',
      source_url: 'https://caphebrewlet.example/img/phin.jpg',
      sourceUrl: 'https://caphebrewlet.example/img/phin.jpg',
      caption: 'Phin sữa đá của quán',
      width: 1200,
      height: 900
    }
  ],
  posts: []
})

/** A cafe revision with the frozen profile and a brief whose "Phin sữa đá" holds the photo as a candidate. */
function cafeRevision() {
  const research = cafeResearch()
  const brief = domain.buildBrief({
    opportunity: research.opportunity,
    profile: research.profile,
    media: research.media,
    posts: [],
    madeAt: AT
  })
  return { brief, place_profile: freezePlaceProfile({ research, at: AT }) }
}

const imageOf = (placed, dish) => {
  const offering = placed.profile.offerings.find((o) => o.value.name === dish)
  const plan = domain.planSlotFill({
    slotRoles: slotRolesOf(TRACY_BASE_J6).doc,
    profile: placed.profile,
    assessment: placed.assessment,
    locale: 'vi',
    neutralFor: domain.neutralFor
  })
  const writes = plan.writes.filter((w) => w.role === 'offering.image')
  return {
    ofDish: writes.find((w) => w.entityId === offering.id)?.value ?? null,
    any: writes
      .filter((w) => w.value && typeof w.value === 'object')
      .map((w) => ({ entityId: w.entityId, mediaId: w.value.mediaId }))
  }
}

test('a dish photo vision accepts at build time reaches the frozen path’s slot plan, beside its own dish', () => {
  const revision = cafeRevision()
  const frozenBefore = structuredClone(revision.place_profile)
  const photo = revision.brief.sitemap
    .flatMap((p) => p.sections.flatMap((s) => s.menuItems ?? []))
    .find((i) => i.name === 'Phin sữa đá')?.photo
  assert.equal(photo?.status, 'candidate', 'the brief holds the photo as a candidate only')
  const placed = placeProfileOfRevision(domain, revision, {
    pictures: [{ id: 'm-phin', postId: null, vision: { subject: 'drink' } }]
  })
  assert.equal(placed.provisional, false)
  const media = placed.profile.media.find((m) => m.value.sha256 === PHIN_SHA)
  const phin = placed.profile.offerings.find((o) => o.value.name === 'Phin sữa đá')
  const { ofDish, any } = imageOf(placed, 'Phin sữa đá')
  assert.equal(ofDish?.mediaId, media.id, 'the photo fills the image slot of Phin sữa đá')
  assert.ok(any.length > 0)
  assert.deepEqual(new Set(any.map((w) => w.entityId)), new Set([phin.id]), 'and no other dish’s')
  const relation = media.value.relations.find((r) => r.relation === 'depicts')
  const evidence = placed.profile.evidence.find((e) => e.id === relation.evidenceRefs[0])
  assert.equal(evidence?.extraction?.method, 'dish-photos')
  assert.deepEqual(revision.place_profile, frozenBefore, 'the frozen profile and its hash stay as they were')
})

test('a candidate dish photo no vision confirmed stays off the frozen path’s slot plan', () => {
  const revision = cafeRevision()
  for (const pictures of [undefined, [{ id: 'm-phin', postId: null, vision: { subject: 'interior' } }]]) {
    const placed = placeProfileOfRevision(domain, revision, pictures ? { pictures } : {})
    assert.deepEqual(imageOf(placed, 'Phin sữa đá').any, [])
  }
})
