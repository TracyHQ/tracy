// Person frames decided by code (#340): a person with no confirmed portrait and no name to draw initials from loses
// the frame for that reason, not for want of a real photo.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { brief, contentMap, kit, PHOTO_BYTES, plan } from './_site-pictures-bench.mjs'

const kitDoc = () => ({ ...kit(), contentMap: contentMap() })

test('a person frame with no portrait and no name says so', async () => {
  const b = brief()
  b.facts = b.facts.filter((f) => f.id !== 'f-mechanic')
  const got = await fillFrames({ plan: plan(), brief: b, kit: kitDoc(), photoBytes: PHOTO_BYTES })
  const hidden = got.frames.find((e) => e.frame === 'block-4.2')
  const returned = got.returns.find((r) => r.frame === 'block-4.2')
  const reason = hidden?.reason ?? returned?.reason
  assert.ok(reason, JSON.stringify({ frames: got.frames.map((e) => e.frame), returns: got.returns }))
  assert.match(reason, /no confirmed portrait and no name to draw initials from/)
})
