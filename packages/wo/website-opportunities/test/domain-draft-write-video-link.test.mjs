// A placed own video is written as the link its kit field expects (#575 pictures, the write stage hook): a
// `business.video` field is a `link` field of a url slot (JA Boxing 1.0.11: block-181's gallery videos, the class
// page's lead video and its video list), so the video's web address is the value, never a picture upload, and the
// write guard no longer stops it `picture_web_address_only`. Invented florist order, invented addresses.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-video-link.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { site } from './fixtures/draft-write/guarded.mjs'

const VIDEO = 'https://video.example/watch/invented-class'

function planWith(change) {
  const order = structuredClone(site.order)
  const picture = order.pictures.find((p) => p.source === 'own')
  change(picture)
  const stored = Object.fromEntries(order.pictures.map((p) => [p.frame, { id: `stored-${p.frame}` }]))
  delete stored[picture.frame]
  return { plan: writePlanOf(order, site.aiq, { stored }), picture }
}

test('an own video placed by its web address is written as its link, with no upload', () => {
  const { plan, picture } = planWith((p) => Object.assign(p, { kind: 'business.video', ref: VIDEO }))
  assert.ok(!plan.ops.some((o) => o.kind === 'picture.upload' && o.picture === picture.frame))
  assert.ok(JSON.stringify(plan.ops).includes(VIDEO))
})

test('a picture by a web address alone still stops the write, typed', () => {
  assert.throws(
    () => planWith((p) => Object.assign(p, { ref: 'https://photos.example/rose.jpg' })),
    (error) => /picture_web_address_only/.test(String(error?.code ?? error?.message))
  )
})
