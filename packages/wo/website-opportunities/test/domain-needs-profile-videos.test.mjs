// The plan knows the owner has videos (#575, plan stage inputs, P10): the research keeps the business's own videos
// apart (the needs profile reads none), so the plan never knew there were any. The profile now counts them per source,
// and the business the plan composer reads says how many and from where, never a video's address. The JA Boxing kit
// has video places (its gallery block and the class detail page). An invented florist, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-videos.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { modelViewOf, planDataOf } from '../domain/plan-data.mjs'
import { boxingStore } from './fixtures/write-order/boxing-florist.mjs'

const SITE = 'https://fernhollow-flowers.example/'
const own = (id, source, more = {}) => ({
  id,
  kind: 'video',
  source,
  uploaderRole: 'owner',
  content: 'space',
  ...more
})
const brief = () => ({
  schemaVersion: 2,
  business: { name: 'Fernhollow Flowers' },
  facts: [
    {
      id: 'f-name',
      field: 'name',
      value: 'Fernhollow Flowers',
      evidence: [{ source: 'website', ref: SITE, quote: 'Fernhollow Flowers' }],
      confidence: 'single-source',
      onSite: true,
      decidedBy: 'rule',
      reasons: []
    }
  ],
  assets: [
    own('v1', 'instagram', { caption: 'Tying a bridal bouquet' }),
    own('v2', 'instagram'),
    own('v3', 'website'),
    // A guest's video is not the business's own: never counted.
    { id: 'v4', kind: 'video', source: 'google-places', uploaderRole: 'customer', content: 'space' }
  ]
})
const manifest = ['v1', 'v2', 'v3', 'v4'].map((id) => ({ id, sourceUrl: `${SITE}video/${id}.mp4` }))

test('the needs profile counts the owner own videos per source and keeps their records', () => {
  const profile = needsProfileOf(researchOf(brief(), { manifest }), {})
  assert.equal(profile.videos.count, 3)
  assert.deepEqual(profile.videos.sources, [
    { id: 'instagram', origin: 'social', count: 2 },
    { id: 'website', origin: 'website', count: 1 }
  ])
  assert.deepEqual(profile.videos.items[0], {
    id: 'v1',
    ref: `${SITE}video/v1.mp4`,
    source: 'instagram',
    label: 'Tying a bridal bouquet'
  })
})

test('the business the plan composer reads says how many videos and from where, never an address', () => {
  const view = modelViewOf(planDataOf(needsProfileOf(researchOf(brief(), { manifest }), {})))
  assert.deepEqual(view.videos, {
    count: 3,
    sources: [
      { kind: 'social', name: 'Social profile', count: 2 },
      { kind: 'website', name: 'Website', count: 1 }
    ]
  })
  assert.equal(JSON.stringify(view).includes('.mp4'), false)
})

test('a profile without videos says nothing of them', () => {
  const noVideos = { ...brief(), assets: [] }
  const profile = needsProfileOf(researchOf(noVideos, { manifest }), {})
  assert.equal(profile.videos, undefined)
  assert.equal(modelViewOf(planDataOf(profile)).videos, undefined)
})

test('the JA Boxing kit declares places for a video', () => {
  const places = boxingStore.blocks.filter((d) =>
    [...(d.fields ?? []), ...(d.itemFields ?? []), ...(d.lists ?? []).flatMap((l) => l.fields ?? [])].some(
      (f) => f?.kind === 'business.video'
    )
  )
  assert.ok(places.length >= 1)
})
