// The plan card's Left out list keeps each entry's stable reason code (#609), and a fact a left out entry reports by
// `item` is said under Left out only, never also listed as a business fact the site shows. Every business here is
// invented.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/build-chat-plan-left-out-codes.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCardOf } from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan

test('left out keeps the reason code and its params, and the same words under two codes stay two lines', () => {
  const p = plan()
  const reason =
    'No gallery has room for these 2 photos. They stay with your photos and may be used elsewhere on the site.'
  p.leftOut = [
    { what: 'Photo', kind: 'item', reason, code: 'no_gallery_room', params: { count: 2 } },
    { what: 'Photo', kind: 'item', reason, code: 'no_gallery_room', params: { count: 2 } },
    { what: 'Photo', kind: 'item', reason, code: 'model_reason' },
    { what: 'Blog', kind: 'page', reason: 'Your website has no posts.', params: { count: 1 } }
  ]
  assert.deepEqual(planCardOf(p).leftOut, [
    { what: '2 photos', kind: 'item', reason, code: 'no_gallery_room', params: { count: 2 }, count: 2 },
    { what: 'Photo', kind: 'item', reason, code: 'model_reason' },
    // Params without a code are not read: there is no sentence they could fill.
    { what: 'Blog', kind: 'page', reason: 'Your website has no posts.' }
  ])
})

test('a fact a left out entry reports by item is listed under Left out only, unless a page shows it', () => {
  const p = plan()
  // The email is taken off every page; the phone stays on the pages that show it.
  for (const page of p.pages)
    for (const b of page.blocks) b.data = (b.data ?? []).filter((id) => id !== 'email')
  const hidden = p.facts.find((f) => f.id === 'email')
  const shown = p.facts.find((f) => f.id === 'phone')
  assert.ok(p.pages.some((page) => page.blocks.some((b) => (b.data ?? []).includes('phone'))))
  p.leftOut = [
    {
      what: hidden.label ?? hidden.kind,
      kind: 'item',
      item: hidden.id,
      reason: 'You asked to keep this off the site.'
    },
    {
      what: shown.label ?? shown.kind,
      kind: 'item',
      item: shown.id,
      reason: 'You asked to keep this off the site.'
    }
  ]
  const ids = planCardOf(p).facts.map((f) => f.id)
  assert.equal(ids.includes(hidden.id), false, `${hidden.id} is not also a fact the site shows`)
  assert.equal(ids.includes(shown.id), true, `${shown.id} stays: a page shows it`)
  assert.equal(planCardOf(p).leftOut.length, 2)
})

test('a research source that could not be read is not a line of what is not on the site', () => {
  const p = plan()
  const reason = 'None of the sources we read gives this, so your site does not show it yet.'
  p.leftOut = [
    { what: 'Prices', kind: 'feature', reason, code: 'not_collected', params: { count: 1, field: 'prices' } },
    // A newer plan names the field; an older one only the plain form of `source:<source>`.
    {
      what: 'Source:maps',
      kind: 'feature',
      reason,
      code: 'not_collected',
      params: { count: 1, field: 'source:maps' }
    },
    { what: 'Source:listing site', kind: 'feature', reason, code: 'not_collected', params: { count: 1 } }
  ]
  assert.deepEqual(
    planCardOf(p).leftOut.map((l) => l.what),
    ['Prices']
  )
})
