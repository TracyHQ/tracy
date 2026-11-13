// Which field is a fact value and which is copy (`owner-echo-fields.mjs`, decision D46, #609): every field a reading
// and the brief's view of it hold has a class (a new field without one fails here), a copy field that echoes the owner
// goes alone and the item's facts stay, a tagline the owner states waits for a product decision, and the record of
// what the guard did reaches the brief. Invented massage studio, the fictional Harbour Sport Club; no model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-echo-fields.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import { renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { itemKindsOfBrief, routesOfBrief } from '../domain/brief-item-routes.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { READING_FIELD_CLASSES } from '../domain/owner-echo-fields.mjs'
import { readingWithoutOwnerQuotes } from '../domain/owner-statement.mjs'
import { makeSiteBrief } from '../src/brief-research.js'
import { MASSAGE_ANSWER, MASSAGE_BIO, MASSAGE_STATEMENT } from './fixtures/owner-statement/massage-studio.mjs'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const sources = readingSourcesOf({ bio: MASSAGE_BIO, ownerStatement: MASSAGE_STATEMENT })
// The massage answer plus a public item of every shape: a price, mentions, a basis, a key message on the bio.
const ANSWER = {
  ...MASSAGE_ANSWER,
  services: [
    ...MASSAGE_ANSWER.services,
    { name: 'Massage therapy', quote: 'Massage therapy in Velmora', ref: 'bio', price: 'Velmora' }
  ],
  keyMessages: [
    ...MASSAGE_ANSWER.keyMessages,
    { label: 'massage therapy in Velmora', quotes: [{ quote: 'Massage therapy in Velmora', ref: 'bio' }] }
  ]
}
const read = { method: 'model', ...checkBusinessReading(ANSWER, sources, { trade: 'other' }) }

function brief() {
  return makeSiteBrief(
    domain,
    {
      profile: { ...HSC.profile, businessReading: read },
      brand: HSC.brand,
      sources: [
        { source: 'instagram', ref: 'https://www.instagram.com/harbour.sportclub/', status: 'complete' }
      ],
      media: HSC.media,
      posts: HSC.posts
    },
    { opportunity: HSC.opportunity, madeAt: HSC.madeAt }
  )
}

/** Every `[group, field]` a reading's items hold that the class table does not name. */
function unclassed(reading) {
  const out = []
  for (const [group, value] of Object.entries(reading)) {
    const classes = READING_FIELD_CLASSES[group]
    const items = Array.isArray(value) ? value : group === 'subTrade' && value ? [value] : []
    if (!classes) {
      if (items.some((i) => i && typeof i === 'object')) out.push([group, '*'])
      continue
    }
    for (const i of items)
      for (const field of Object.keys(i)) if (!(field in classes)) out.push([group, field])
  }
  return out
}

test('every field of the reading, its brief view and the brief has a class: a new one fails here', () => {
  const made = brief()
  assert.deepEqual(unclassed(read), [])
  assert.deepEqual(unclassed(readingWithoutOwnerQuotes(read)), [])
  assert.deepEqual(unclassed(made.reading), [])
  assert.deepEqual(unclassed({ services: [{ label: 'x', invented: 1 }] }), [['services', 'invented']])
  assert.deepEqual(unclassed({ newGroup: [{ label: 'x' }] }), [['newGroup', '*']])
  // Every class is one of four.
  for (const fields of Object.values(READING_FIELD_CLASSES))
    for (const c of Object.values(fields)) assert.ok(['name', 'copy', 'evidence', 'record'].includes(c))
})

test('names and values the owner typed stay, a team member with her role among them', () => {
  assert.deepEqual(
    read.services.map((s) => s.label),
    ['Deep tissue sports massage', 'Free local delivery over 30 dollars', 'Massage therapy']
  )
  assert.deepEqual(
    read.team.map((p) => [p.label, p.role]),
    [['Mira Solent', 'head therapist and founder since 2011']]
  )
  assert.deepEqual(
    read.serviceAreas.map((a) => a.label),
    ['North Velmora and South Velmora']
  )
  assert.deepEqual(
    read.audience.map((a) => a.label),
    ['office workers and weekend runners']
  )
})

test('copy echoing the owner leaves as facts; the tagline waits for a product decision and never reaches copy', () => {
  assert.deepEqual(
    read.ownerFacts.map((f) => [f.kind, f.group, f.text, f.reason ?? null]),
    [
      ['owner-tagline', 'story', 'Strong Hands Calm Minds', 'awaits_product_decision'],
      ['owner-fact', 'facts', 'open seven days a week', null],
      ['owner-fact', 'facts', '12 Harbour Road, Velmora', null],
      ['owner-fact', 'keyMessages', 'open seven days a week', null]
    ]
  )
  // The record names the group, the field, the rule and the weight; never the words.
  for (const d of read.ownerEchoDropped) {
    assert.deepEqual(Object.keys(d).sort(), ['field', 'group', 'kept', 'rule', 'weight', 'why'])
    assert.equal(JSON.stringify(d).includes('Velmora'), false)
  }
  const markdown = renderBriefMarkdown(brief())
  assert.doesNotMatch(markdown, /strong hands/i)
  assert.match(markdown, /The owner states a tagline in the build chat: it waits for a product decision/)
  assert.match(
    markdown,
    /- What the owner states in the build chat, facts to write from[^\n]*\n {2}- "open seven days a week"/
  )
})

test('the brief carries the owner facts and the count and groups of the echoes, routed as never shown', () => {
  const made = brief()
  assert.deepEqual(validateBrief(made).errors ?? [], [])
  assert.deepEqual(made.reading.ownerEchoDropped, { count: 4, groups: ['story', 'facts', 'keyMessages'] })
  assert.equal(made.reading.ownerFacts.length, 4)
  const kinds = itemKindsOfBrief(made)
  assert.equal(kinds.get('owner-fact'), 3)
  assert.equal(kinds.get('owner-tagline'), 1)
  const routes = routesOfBrief(made)
  assert.ok(routes.notShown.some((r) => r.kind === 'owner-tagline'))
  assert.ok(routes.notShown.some((r) => r.kind === 'owner-fact'))
})
