// The plan card's Left out list is for the owner (#575 walk: 49 lines, with a review's words, one line per reviewer,
// a page's footer logo and "2 serviceses"): sections of the template and its empty picture spots are never listed,
// items are grouped by their kind with a count, a fact is named by its label, and a plural is never made of a plural.
// Every business here is invented.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/build-chat-plan-left-out-owner.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCardOf } from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
const TOO_LONG = 'This review is longer than the space for review text.'

function withReviews() {
  const p = plan()
  for (const [id, label] of [
    ['quote-a', 'Review by Wren Halloway'],
    ['quote-b', 'Review by Pim Ostrander'],
    ['quote-c', 'Review: Lovely courts and patient coaches, my kids...']
  ])
    p.items.push({ id, kind: 'quote', label, sources: [{ kind: 'google', name: 'Google Maps listing' }] })
  p.facts.push({ id: 'summary', kind: 'business.summary', label: 'About', value: 'A club.', sources: [] })
  p.leftOut = [
    { what: 'Prices page', kind: 'page', reason: 'No public prices found.' },
    { what: 'Footer logo', kind: 'block', reason: 'Your logo is handled separately.', code: 'model_reason' },
    { what: 'Services', kind: 'block', reason: 'Fewer rows.', code: 'list_below_min' },
    { what: 'Services', kind: 'block', reason: 'Fewer rows.', code: 'list_below_min' },
    {
      what: 'Review by Wren Halloway',
      kind: 'item',
      item: 'quote-a',
      reason: TOO_LONG,
      code: 'model_reason'
    },
    {
      what: 'Review by Pim Ostrander',
      kind: 'item',
      item: 'quote-b',
      reason: TOO_LONG,
      code: 'model_reason'
    },
    {
      what: 'Review: Lovely courts',
      kind: 'item',
      item: 'quote-c',
      reason: 'No rating.',
      code: 'model_reason'
    },
    { what: 'About', kind: 'feature', item: 'summary', reason: 'No place.', code: 'no_place_in_design' },
    {
      what: '1 picture spot of a person',
      kind: 'feature',
      reason: 'Never people.',
      code: 'no_generated_people'
    },
    { what: 'Opening hours', kind: 'feature', reason: 'Held.', code: 'hours_unconfirmed' }
  ]
  return p
}

test('template sections and empty picture spots are never listed; items are counted by kind, never named', () => {
  const lines = planCardOf(withReviews()).leftOut
  assert.deepEqual(lines, [
    { what: 'Prices page', kind: 'page', reason: 'No public prices found.' },
    {
      what: '3 reviews',
      kind: 'item',
      reason: TOO_LONG,
      code: 'model_reason',
      dataKind: 'quote',
      also: [{ reason: 'No rating.', code: 'model_reason' }],
      count: 3
    },
    {
      what: 'About',
      kind: 'feature',
      reason: 'No place.',
      code: 'no_place_in_design',
      factKind: 'business.summary'
    },
    { what: 'Opening hours', kind: 'feature', reason: 'Held.', code: 'hours_unconfirmed' }
  ])
  const said = JSON.stringify(lines)
  for (const name of ['Wren', 'Pim', 'Lovely', 'serviceses', 'Footer'])
    assert.equal(said.includes(name), false, name)
})

test('the pages of the template left out for one reason are one line, a few named and the others counted', () => {
  const p = plan()
  const page = (name, reason = 'Nothing yet.', code = 'page_nothing_to_show') => ({
    what: `${name} page`,
    kind: 'page',
    reason,
    code,
    params: { page: name }
  })
  p.leftOut = [
    page('News'),
    page('Featured posts'),
    page('Home', 'No photo for its banner.', 'model_reason'),
    page('Authors'),
    page('Plans'),
    page('Trainers')
  ]
  const lines = planCardOf(p).leftOut
  assert.deepEqual(lines, [
    {
      what: 'News, Featured posts, Authors and 2 more pages',
      kind: 'page',
      reason: 'Nothing yet.',
      code: 'page_nothing_to_show',
      pages: ['News', 'Featured posts', 'Authors', 'Plans', 'Trainers']
    },
    {
      what: 'Home page',
      kind: 'page',
      reason: 'No photo for its banner.',
      code: 'model_reason',
      pages: ['Home']
    }
  ])
})

test('a one word label that is plural already takes its count after it', () => {
  const p = plan()
  p.leftOut = [
    { what: 'Services', kind: 'page', reason: 'Same.' },
    { what: 'Services', kind: 'page', reason: 'Same.' },
    { what: 'Photo', kind: 'feature', reason: 'Same.' },
    { what: 'Photo', kind: 'feature', reason: 'Same.' }
  ]
  assert.deepEqual(
    planCardOf(p).leftOut.map((l) => l.what),
    ['Services (2)', '2 photos']
  )
})

test('a social link names the social profile as its source when it is one of its sources', () => {
  const p = plan()
  p.facts.push({
    id: 'insta',
    kind: 'contact.social_url',
    label: 'Social link',
    value: 'https://social.example/larkfen',
    sources: [
      { kind: 'google', name: 'Google Maps listing' },
      { kind: 'social', name: 'Social profile' }
    ]
  })
  const fact = planCardOf(p).facts.find((f) => f.id === 'insta')
  assert.deepEqual([fact.source, fact.sourceKind], ['Social profile', 'social'])
})
