// The brief states what its own photos show as observed facts: held again against the brief's own assets (a fact resting
// only on a guest's or a blurry photo is not stated), valid in the schema, and rendered with the rule that keeps them to
// angles and picture descriptions. Fixtures are fictional: the Willowmere Racquet House does not exist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { OBSERVED_USE_RULE } from '../domain/pictures/observed-facts.mjs'

const sha = (n) => String(n).repeat(64).slice(0, 64)
const photo = (id, n, vision) => ({
  id,
  kind: 'image',
  category: 'space',
  sha256: sha(n),
  width: 2000,
  height: 1200,
  source: 'website',
  sourceUrl: `https://willowmere.example/${id}.jpg`,
  labels: { vision: { labels: { quality: 'good', isOwnPhoto: true, isGraphic: false, ...vision } } }
})
const MEDIA = [
  photo('wm-01', 1, { content: 'venue-exterior', caption: 'An orange clay court with a net.' }),
  photo('wm-02', 2, { content: 'people-in-action', caption: 'A coach with children on a clay court.' }),
  // A guest's photo on a listing (the model also judged it a snapshot).
  {
    ...photo('wm-03', 3, {
      content: 'venue-exterior',
      caption: 'A clay court from the stands.',
      isOwnPhoto: false
    }),
    source: 'google-places',
    credit: 'A Visitor'
  },
  photo('wm-04', 4, { content: 'venue-exterior', caption: 'A blurry pool.', quality: 'blurry' })
]
const OBSERVED = [
  { field: 'facility', value: 'clay courts', assetIds: ['wm-01', 'wm-02', 'wm-03'] },
  { field: 'activity', value: 'group coaching for children', assetIds: ['wm-02'] },
  // Rests only on photos the brief may not read: never stated.
  { field: 'facility', value: 'outdoor pool', assetIds: ['wm-03', 'wm-04'] }
]
const brief = (observedFacts) =>
  buildBrief({
    opportunity: {
      id: 'opp-willowmere',
      name: 'Willowmere Racquet House',
      candidate: { name: 'Willowmere Racquet House', trade: 'fitness' }
    },
    profile: { name: 'Willowmere Racquet House' },
    media: MEDIA,
    madeAt: '2026-10-01T00:00:00.000Z',
    ...(observedFacts ? { observedFacts } : {})
  })

test('observed facts join the brief, held to its own sharp, own photos', () => {
  const b = brief(OBSERVED)
  const observed = b.facts.filter((f) => f.sourceKind === 'observed')
  assert.deepEqual(
    observed.map((f) => [f.field, f.value, f.assetIds]),
    [
      ['facility', 'clay courts', ['wm-01', 'wm-02']],
      ['activity', 'group coaching for children', ['wm-02']]
    ]
  )
  assert.ok(observed.every((f) => f.onSite && f.decidedBy === 'rule'))
  assert.deepEqual(validateBrief(b), { ok: true, errors: [] })
  // Text facts carry no source kind of their own: they are stated.
  assert.ok(b.facts.filter((f) => f.sourceKind !== 'observed').every((f) => !('assetIds' in f)))
})

test('no observation, no observed fact', () => {
  assert.equal(brief(null).facts.filter((f) => f.sourceKind === 'observed').length, 0)
})

test('an observed fact must name photos of the brief', () => {
  const b = brief(OBSERVED)
  const bad = structuredClone(b)
  bad.facts.find((f) => f.sourceKind === 'observed').assetIds = ['wm-99']
  assert.equal(validateBrief(bad).ok, false)
  const kind = structuredClone(b)
  kind.facts[0].sourceKind = 'guessed'
  assert.equal(validateBrief(kind).ok, false)
})

test('the markdown and the schema state the rule observed facts are read by', () => {
  const md = renderBriefMarkdown(brief(OBSERVED))
  assert.ok(md.includes(OBSERVED_USE_RULE))
  assert.match(md, /- facility: "?clay courts"? .*observed in 2 photos/)
  const schema = JSON.parse(readFileSync(new URL('../domain/brief-schema.json', import.meta.url), 'utf8'))
  const fact = schema.properties.facts.items.properties
  assert.deepEqual(fact.sourceKind.enum, ['stated', 'observed'])
  assert.ok(fact.sourceKind.description.includes(OBSERVED_USE_RULE))
  assert.equal(fact.assetIds.type, 'array')
})
