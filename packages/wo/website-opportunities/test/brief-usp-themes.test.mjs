// A reading's proved review themes must survive the brief boundary, for every trade and CMS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBrief } from '../domain/brief.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { readBusiness } from '../src/business-reading.js'
import { readingWithoutHeldReviews } from '../domain/held-reviews.mjs'
import { findUsp } from '../domain/hero-usp.mjs'

const reviews = [
  { author: 'A. Guest', text: 'I take lessons here. My kids also learn with the same teachers.' },
  { author: 'B. Guest', text: 'She teaches my husband and also teaches my son. We keep improving.' },
  { author: 'C. Guest', text: 'Very nice teachers, they are teaching my daughters.' }
]
const theme = {
  label: 'one team for the whole family',
  line: 'One team for the whole family',
  accent: 'whole family',
  quotes: [
    { ref: 'review:1', quote: reviews[0].text },
    { ref: 'review:2', quote: reviews[1].text }
  ]
}
const primaryAction = { label: 'Request a lesson', channel: 'contact', basis: 'inferred', quotes: [] }
const freeze = (reading, trade) =>
  buildBrief({
    opportunity: { id: 'fictional-opportunity', name: 'Meadow Learning', candidate: { trade } },
    profile: { name: 'Meadow Learning', bio: 'Lessons in North Haven', businessReading: reading },
    googlePlace: { placeId: 'fictional-place', reviews },
    madeAt: '2026-10-29T10:00:00Z'
  })

for (const trade of ['fitness', 'education']) {
  test(`${trade}: differently worded family evidence passes both gates and survives into the brief`, () => {
    const checked = checkBusinessReading({ uspThemes: [theme] }, readingSourcesOf({ reviews }), { trade })
    assert.equal(checked.uspThemes.length, 1, 'the reading gate keeps the model proposal')
    const reading = {
      ...checked,
      method: 'model',
      version: 'business-reading-test',
      inputHash: 'fictional-input',
      model: 'fictional-model'
    }
    const brief = freeze(reading, trade)
    assert.deepEqual(brief.reading.uspThemes, checked.uspThemes)
    assert.equal(brief.reading.version, reading.version)
    assert.equal(brief.reading.inputHash, reading.inputHash)
    assert.equal(brief.reading.model, reading.model)
    assert.equal(findUsp(brief).usp.headlines[0], theme.line)
  })
}

test('a model that omits themes is distinguished from a gate that rejects an unsupported theme', () => {
  const sources = readingSourcesOf({ reviews })
  const omitted = checkBusinessReading({}, sources)
  assert.equal(omitted.uspThemes, null)
  assert.equal(omitted.uspThemesReason, 'not_proposed')
  const rejected = checkBusinessReading({ uspThemes: [{ ...theme, quotes: [theme.quotes[0]] }] }, sources)
  assert.equal(rejected.uspThemes, null)
  assert.equal(rejected.uspThemesReason, 'rejected')
})

test('legacy model and rule readings explicitly explain their missing themes in the frozen brief', () => {
  const empty = { services: [], audience: [], team: [], story: [] }
  const legacy = freeze({ ...empty, method: 'model' }, 'education')
  assert.equal(legacy.reading.uspThemes, null)
  assert.equal(legacy.reading.uspThemesReason, 'not_recorded')
  const rules = freeze({ ...empty, method: 'rules', reason: 'not_configured' }, 'fitness')
  assert.equal(rules.reading.uspThemes, null)
  assert.equal(rules.reading.uspThemesReason, 'rules_not_configured')
})

test('holding a review explains why its previously proved theme can no longer be used', () => {
  const reading = checkBusinessReading({ uspThemes: [theme] }, readingSourcesOf({ reviews }))
  const held = readingWithoutHeldReviews(reading, { held: [reviews[0]] })
  assert.equal(held.uspThemes, null)
  assert.equal(held.uspThemesReason, 'held_review_evidence')
})

test('the reading input hash cannot reuse a reading made by an older prompt version', async () => {
  let calls = 0
  const input = {
    reviews,
    name: 'Meadow Learning',
    door: {
      state: 'ready',
      door: { url: 'https://model.test/chat/completions', key: 'fictional-key', model: 'fictional-model' }
    },
    charge: (_spec, call) => call(),
    fetchImpl: async () => {
      calls += 1
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify({ uspThemes: [theme], primaryAction }) }
          }
        ]
      })
    }
  }
  const first = await readBusiness(input)
  const cached = await readBusiness({ ...input, held: first })
  assert.equal(calls, 1)
  assert.deepEqual(cached.uspThemes, first.uspThemes)
  const refreshed = await readBusiness({ ...input, held: { ...first, version: 'business-reading-4-old' } })
  assert.equal(calls, 2, 'a matching input hash does not bypass the prompt version')
  assert.deepEqual(refreshed.uspThemes, first.uspThemes)
})

test('a cached model reading predating theme diagnostics explicitly marks the missing proposal', async () => {
  const input = {
    reviews,
    door: {
      state: 'ready',
      door: { url: 'https://model.test/chat/completions', key: 'fictional-key', model: 'fictional-model' }
    },
    charge: (_spec, call) => call(),
    fetchImpl: async () =>
      Response.json({ choices: [{ message: { content: JSON.stringify({ primaryAction }) } }] })
  }
  const first = await readBusiness(input)
  const { uspThemes: _themes, uspThemesReason: _reason, ...legacy } = first
  const cached = await readBusiness({
    ...input,
    held: legacy,
    fetchImpl: () => assert.fail('cache should pay nothing')
  })
  assert.equal(cached.uspThemes, null)
  assert.equal(cached.uspThemesReason, 'not_recorded')
})
