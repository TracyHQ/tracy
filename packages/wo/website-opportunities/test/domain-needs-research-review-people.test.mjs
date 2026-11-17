// People only guest reviews name reach the needs profile as person items (#575, plan stage inputs, P3): the brief
// shows two coaches customers named (the step chain's rule, `liftReviewPeople`), so the research gives each as a typed
// person of the source that named them, with name and role only, marked as named by a customer; a person the brief
// still holds stays off, set aside with its code. What the brief holds back carries stable codes and counts. An
// invented racquet club, a scripted reading, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-research-review-people.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heldBackOf } from '../domain/brief-held-back.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { researchOf } from '../domain/needs-research.mjs'

const fact = (id, field, value, evidence, more = {}) => ({
  id,
  field,
  value,
  evidence,
  confidence: 'single-source',
  onSite: true,
  decidedBy: 'rule',
  reasons: [],
  ...more
})
const REVIEW = 'Padel coaching with Anouk and Dario was great, both coaches are patient.'
const reviewer = { ref: 'review:1', kind: 'review', source: 'google' }

/** An invented brief: no real club, place, person or review. */
const clubBrief = () => ({
  schemaVersion: 2,
  business: { name: 'Larkspur Racquet Club' },
  facts: [
    fact('f-name', 'name', 'Larkspur Racquet Club', [{ source: 'google', quote: 'Larkspur Racquet Club' }]),
    // Shown by the brief's rule (a role the reviews give), so still marked review-only-person.
    fact('f-anouk', 'team', { name: 'Anouk', role: 'coach' }, [{ source: 'google', quote: REVIEW }], {
      reasons: ['review-only-person']
    }),
    fact('f-dario', 'team', { name: 'Dario', role: 'coach' }, [{ source: 'google', quote: REVIEW }], {
      reasons: ['review-only-person']
    }),
    // Named once with no role: the brief holds this person.
    fact('f-pim', 'team', { name: 'Pim' }, [{ source: 'google' }], {
      onSite: false,
      reasons: ['review-only-person']
    }),
    fact('f-rating', 'googleRating', { label: 'rating', amount: 5 }, [{ source: 'google' }], {
      onSite: false,
      reasons: ['few-reviews']
    }),
    fact('f-count', 'googleRating', { label: 'reviewCount', amount: 4 }, [{ source: 'google' }], {
      onSite: false,
      reasons: ['few-reviews']
    }),
    fact('f-post', 'posts', { text: 'Summer camp 2019' }, [{ source: 'instagram' }], {
      onSite: false,
      reasons: ['stale']
    })
  ],
  missing: [
    { field: 'prices', why: 'No supported price is available in the business reading: show no price.' },
    { field: 'googleRating', why: "Google's rating counts only 4 reviews." }
  ],
  stale: [
    { field: 'media:p1', source: 'instagram', seenAt: '2019-06-01' },
    { field: 'media:p2', source: 'instagram', seenAt: '2019-06-02' }
  ],
  googlePlace: { reviews: [{ author: 'Guest One', text: REVIEW, rating: 5 }] },
  reading: {
    team: [
      {
        id: 't1',
        label: 'Anouk',
        role: 'coach',
        factId: 'f-anouk',
        onSite: true,
        quote: REVIEW,
        source: reviewer
      },
      {
        id: 't2',
        label: 'Dario',
        role: 'coach',
        factId: 'f-dario',
        onSite: true,
        quote: REVIEW,
        source: reviewer
      },
      { id: 't3', label: 'Pim', factId: 'f-pim', onSite: false, source: reviewer }
    ]
  },
  assets: []
})

test('people the brief shows from reviews are typed person items of the source that named them', () => {
  const research = researchOf(clubBrief())
  const google = research.sources.find((s) => s.id === 'google')
  assert.deepEqual(
    google.items.map((i) => [i.kind, i.fields, i.namedBy]),
    [
      ['person', { 'person.name': 'Anouk', 'person.role': 'coach' }, 'customer'],
      ['person', { 'person.name': 'Dario', 'person.role': 'coach' }, 'customer']
    ]
  )
  assert.deepEqual(research.taken.people, ['f-anouk', 'f-dario'])
  // The review's words are not passed to the model as text too.
  assert.equal(String(google.text ?? '').includes(REVIEW), false)
  // The held person stays off, set aside with the brief's own reason as a code.
  const pim = research.setAside.find((s) => s.id === 'f-pim')
  assert.deepEqual([pim.field, pim.code], ['team', 'review_only_person'])
})

test('the needs profile holds them as people named by a customer, name and role only', () => {
  const research = researchOf(clubBrief())
  const profile = needsProfileOf(research, {})
  assert.deepEqual(
    profile.items.person.map((p) => [
      p.fields['person.name'].value,
      p.fields['person.role'].value,
      p.namedBy
    ]),
    [
      ['Anouk', 'coach', 'customer'],
      ['Dario', 'coach', 'customer']
    ]
  )
  for (const p of profile.items.person)
    assert.deepEqual(Object.keys(p.fields).sort(), ['person.name', 'person.role'])
})

test('a person the business itself names as well is not marked as named by a customer', () => {
  const research = researchOf(clubBrief())
  research.sources.push({ id: 'website', origin: 'website', text: 'Head coach Anouk runs the junior squad.' })
  const profile = needsProfileOf(research, {
    items: [
      {
        source: 'website',
        kind: 'person',
        fields: { 'person.name': 'Anouk', 'person.role': 'Head coach' },
        evidence: 'Head coach Anouk runs the junior squad.'
      }
    ]
  })
  const anouk = profile.items.person.find((p) => p.fields['person.name'].value === 'Anouk')
  assert.equal(anouk.namedBy, undefined)
  assert.equal(
    profile.items.person.find((p) => p.fields['person.name'].value === 'Dario').namedBy,
    'customer'
  )
})

test('what the brief holds back carries a stable code and a count, never a value', () => {
  const expected = [
    { field: 'team', code: 'review_only_person', count: 1 },
    { field: 'googleRating', code: 'few_reviews', count: 2 },
    { field: 'posts', code: 'stale', count: 1 },
    { field: 'prices', code: 'not_collected', count: 1 },
    { field: 'photos', code: 'stale', count: 2 }
  ]
  assert.deepEqual(heldBackOf(clubBrief()), expected)
  const research = researchOf(clubBrief())
  assert.deepEqual(research.heldBack, expected)
  assert.deepEqual(needsProfileOf(research, {}).heldBack, expected)
  assert.equal(JSON.stringify(expected).includes('Pim'), false)
})

test('a fact the owner left off is owner_left_off, whatever rule held it first', () => {
  const brief = clubBrief()
  brief.facts.push(
    fact('f-hours', 'hours', ['Mon-Sun 00:00-24:00'], [{ source: 'google' }], {
      onSite: false,
      decidedBy: 'owner',
      reasons: ['implausible-all-week-hours', 'owner-override']
    })
  )
  brief.missing.push({ field: 'hours', why: 'The owner chose to leave the opening hours off the site.' })
  assert.deepEqual(
    heldBackOf(brief).find((e) => e.field === 'hours'),
    { field: 'hours', code: 'owner_left_off', count: 1 }
  )
  assert.equal(researchOf(brief).setAside.find((s) => s.id === 'f-hours').code, 'owner_left_off')
})
