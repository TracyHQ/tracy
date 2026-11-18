// A person only guest reviews name may fill a team card (spec TracyHQ/tracy#189, product owner rule of 29/10/2026): with a
// role the reviews give, or named in at least two reviews. Named once with no role, they stay off; the owner's own
// choice always wins. The brief flags each person shown this way for the owner to check, the reviews naming them are no
// longer held, and the owner is no longer asked about them. All names below are made up.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  liftReviewPeople,
  peopleFromReviewsNote,
  reviewMentionsOf,
  roleInCasingOf,
  showablePeopleOf
} from '../domain/brief-people.mjs'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { briefReadinessOf } from '../domain/brief-readiness.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'

/** A team fact as a stored brief holds it: held off the site by rule, for being named only in reviews. */
const heldFact = (id, name, role) => ({
  id,
  field: 'team',
  value: { name, ...(role ? { role } : {}), relationship: 'team' },
  onSite: false,
  reasons: ['review-only-person'],
  decidedBy: 'rule',
  confidence: 'single-source'
})
const reviewPerson = (id, label, role, factId) => ({
  id,
  label,
  ...(role ? { role } : {}),
  factId,
  source: { ref: 'review:1', kind: 'review', source: 'google' }
})

/** A made-up racquet club: two coaches named in one held review each, with the role "coach". */
function clubBrief() {
  return {
    business: { name: 'Harbourline Racquet Club' },
    facts: [heldFact('f1', 'Anouk', 'coach'), heldFact('f2', 'Dario', 'coach')],
    googlePlace: {
      reviews: [{ author: 'Guest One', text: 'Lovely courts and friendly staff.' }],
      heldReviews: [{ author: 'Guest Two', namesHeld: ['Anouk', 'Dario'] }]
    },
    reading: {
      team: [reviewPerson('t1', 'Anouk', 'coach', 'f1'), reviewPerson('t2', 'Dario', 'coach', 'f2')]
    }
  }
}

/** A made-up dental clinic: two dentists named in two reviews each (no role given), one assistant named once. */
function clinicBrief() {
  return {
    business: { name: 'Brightwater Dental' },
    facts: [heldFact('g1', 'Mara'), heldFact('g2', 'Felipe'), heldFact('g3', 'Noor')],
    googlePlace: {
      reviews: [
        { author: 'Patient A', publishTime: '2026-01-01', text: 'Mara and Felipe were so gentle.' },
        { author: 'Patient B', publishTime: '2026-02-01', text: 'Thanks to Mara for the cleaning.' },
        {
          author: 'Patient C',
          publishTime: '2026-03-01',
          text: 'Felipe explained everything. Noor was kind.'
        }
      ]
    },
    reading: {
      team: [
        reviewPerson('p1', 'Mara', null, 'g1'),
        reviewPerson('p2', 'Felipe', null, 'g2'),
        reviewPerson('p3', 'Noor', null, 'g3')
      ]
    }
  }
}

/** A made-up bakery: the owner names herself in her bio; a helper is named once in a review, with no role. */
function bakeryBrief() {
  return {
    business: { name: 'Crumb and Kettle' },
    facts: [
      {
        id: 'h1',
        field: 'team',
        value: { name: 'Elsie', role: 'owner' },
        onSite: true,
        decidedBy: 'rule',
        reasons: []
      },
      heldFact('h2', 'Bram')
    ],
    googlePlace: { reviews: [{ author: 'Visitor', text: 'Bram served us the best rye.' }] },
    reading: {
      team: [
        { id: 'o1', label: 'Elsie', role: 'owner', factId: 'h1', source: { kind: 'bio' } },
        reviewPerson('o2', 'Bram', null, 'h2')
      ]
    }
  }
}

test('reviewMentionsOf counts different reviews naming a person as a whole word, held reviews included', () => {
  assert.equal(reviewMentionsOf(clinicBrief(), 'Mara'), 2)
  assert.equal(reviewMentionsOf(clinicBrief(), 'Noor'), 1)
  assert.equal(reviewMentionsOf(clinicBrief(), 'Mar'), 0, 'a part of a word is not a mention')
  assert.equal(reviewMentionsOf(clubBrief(), 'Anouk'), 1, 'a held review counts by the names it was held for')
})

test('club: coaches only reviews name, each with a role, are showable from reviews', () => {
  assert.deepEqual(
    showablePeopleOf(clubBrief()).map((p) => [p.label, p.role, p.fromReviews]),
    [
      ['Anouk', 'coach', true],
      ['Dario', 'coach', true]
    ]
  )
})

test('clinic: a person two reviews name is shown without a role; one named once with no role stays off', () => {
  assert.deepEqual(
    showablePeopleOf(clinicBrief()).map((p) => [p.label, p.role, p.fromReviews]),
    [
      ['Mara', null, true],
      ['Felipe', null, true]
    ]
  )
})

test('bakery: the owner from her own bio shows, a helper named once with no role stays off, no note', () => {
  const people = showablePeopleOf(bakeryBrief())
  assert.deepEqual(
    people.map((p) => [p.label, p.fromReviews]),
    [['Elsie', false]]
  )
  assert.equal(peopleFromReviewsNote(people), null)
})

test('the owner’s own choice wins, and any other reason to hold a person keeps them off', () => {
  const brief = clubBrief()
  brief.facts[0] = { ...brief.facts[0], decidedBy: 'owner', reasons: ['owner-left-off'] }
  assert.deepEqual(
    showablePeopleOf(brief).map((p) => p.label),
    ['Dario']
  )
  const stale = clubBrief()
  stale.facts[1] = { ...stale.facts[1], reasons: ['review-only-person', 'stale'] }
  assert.deepEqual(
    showablePeopleOf(stale).map((p) => p.label),
    ['Anouk']
  )
})

test('the note names the people shown from reviews for the owner to check', () => {
  assert.match(
    peopleFromReviewsNote(showablePeopleOf(clubBrief())),
    /Anouk and Dario are shown on the team cards from what guest reviews say/
  )
  const one = peopleFromReviewsNote([{ label: 'Mara', fromReviews: true }])
  assert.match(one, /Mara is shown .*check the name and role with the owner/)
})

test('roleInCasingOf follows the demo role’s casing, never its words', () => {
  assert.equal(roleInCasingOf('coach', 'HEAD TRAINER'), 'COACH')
  assert.equal(roleInCasingOf('coach', 'Assistant coach'), 'Coach')
  assert.equal(roleInCasingOf('Coach', 'trainer'), 'coach')
  assert.equal(roleInCasingOf('coach', '<i class="x"></i>'), 'Coach')
  assert.equal(roleInCasingOf('', 'Coach'), '')
})

test('liftReviewPeople shows a review-only person with a role or two reviews; the reason stays, the facts are not changed', () => {
  const clinic = clinicBrief()
  const before = JSON.stringify(clinic.facts)
  const lifted = liftReviewPeople(clinic.facts, { reviews: clinic.googlePlace.reviews })
  assert.deepEqual(
    lifted.map((f) => [f.value.name, f.onSite, f.reasons]),
    [
      ['Mara', true, ['review-only-person']],
      ['Felipe', true, ['review-only-person']],
      ['Noor', false, ['review-only-person']]
    ]
  )
  assert.equal(JSON.stringify(clinic.facts), before)
  // A role the reading kept from a quote counts, though the fact has none.
  const bakery = bakeryBrief()
  const bram = liftReviewPeople(bakery.facts, {
    reviews: bakery.googlePlace.reviews,
    team: [{ label: 'Bram', role: 'baker' }]
  }).find((f) => f.value.name === 'Bram')
  assert.equal(bram.onSite, true)
  // The owner's choice and any other reason are left as they are.
  const facts = [
    { ...heldFact('x1', 'Anouk', 'coach'), decidedBy: 'owner' },
    { ...heldFact('x2', 'Dario', 'coach'), reasons: ['review-only-person', 'stale'] }
  ]
  assert.deepEqual(
    liftReviewPeople(facts, { reviews: [] }).map((f) => f.onSite),
    [false, false]
  )
})

// The hook in buildBrief, on the made-up Harbour Sport Club fixture: two of its reviews name the coach Alex, one names Sam.
const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const g = HSC.profile.googlePlace
const SOURCES = readingSourcesOf({
  bio: HSC.profile.bio,
  posts: HSC.posts,
  reviews: g.reviews.map((r) => ({ ...r, source: 'google' }))
})
const ANSWER = {
  services: [{ name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' }],
  team: [
    { name: 'Alex', role: '', quote: 'padel coaching with Alex', ref: 'review:1' },
    { name: 'Sam', role: '', quote: 'Alex and Sam', ref: 'review:1' }
  ]
}
const hscBrief = (factOverrides = null) =>
  buildBrief({
    opportunity: {
      ...HSC.opportunity,
      candidate: { ...HSC.opportunity.candidate, ...(factOverrides ? { factOverrides } : {}) }
    },
    profile: {
      ...HSC.profile,
      businessReading: {
        method: 'model',
        ...checkBusinessReading(JSON.stringify(ANSWER), SOURCES, { trade: 'fitness' })
      }
    },
    googlePlace: g,
    sources: [],
    media: HSC.media,
    posts: HSC.posts,
    brand: HSC.brand,
    madeAt: HSC.madeAt
  })
const teamFact = (brief, name) => brief.facts.find((f) => f.field === 'team' && f.value?.name === name)
const teamQuestion = (brief) => briefReadinessOf(brief).ownerQuestions.find((q) => q.id === 'owner.team')

test('buildBrief: a coach two reviews name is shown and flagged; one named once stays held and is asked about', () => {
  const brief = hscBrief()
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  assert.equal(teamFact(brief, 'Alex').onSite, true)
  assert.equal(teamFact(brief, 'Sam').onSite, false)
  const md = renderBriefMarkdown(brief)
  assert.match(md, /- team: "Alex" · .* · shown from reviews, owner to check/)
  assert.match(md, /- "Alex", .*shown from reviews, owner to check/)
  // Alex's only quote is in a review held for naming Sam: he is named without it, never with an empty quote.
  assert.doesNotMatch(md, /undefined/)
  assert.match(md, /- team: "Sam" · .* · off the site: .*review-only-person/)
  // Only Sam is withheld, so the owner question is about the people still held, not about Alex.
  const team = brief.missing.find((m) => m.field === 'team')
  assert.deepEqual(team.withheld[0].values, ['Sam'])
  assert.ok(teamQuestion(brief))
})

test('buildBrief: with every review-only person shown, the owner is not asked which team members to show', () => {
  const first = hscBrief()
  const sam = teamFact(first, 'Sam')
  // The owner shows Sam: nobody is held, so no team question is left.
  const shown = hscBrief({ [sam.id]: { onSite: true, at: '2026-10-27T09:00:00.000Z' } })
  assert.equal(teamFact(shown, 'Alex').onSite, true)
  assert.ok(!shown.missing.some((m) => m.field === 'team'))
  assert.equal(teamQuestion(shown), undefined)
  // The owner's choice wins over the lift: Alex held off by the owner stays off, and is asked about again.
  const alex = teamFact(first, 'Alex')
  const held = hscBrief({
    [sam.id]: { onSite: true, at: '2026-10-27T09:00:00.000Z' },
    [alex.id]: { onSite: false, at: '2026-10-27T09:00:00.000Z' }
  })
  assert.equal(teamFact(held, 'Alex').onSite, false)
  assert.equal(teamFact(held, 'Alex').decidedBy, 'owner')
  assert.doesNotMatch(renderBriefMarkdown(held), /Alex.*shown from reviews, owner to check/)
  assert.ok(held.missing.some((m) => m.field === 'team'))
})
