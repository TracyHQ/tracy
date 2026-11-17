// The build chat's research step hands the needs profile the owner's own videos and what the brief holds back, by
// code (#575, plan stage inputs): the profile counts the videos (P10) and keeps each held back field with a stable
// code and count, so the plan can know them. The invented club; scripted fake model only, no database.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-research-extras.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, test } from 'node:test'
import { researchStep } from '../src/build-draft/engine-steps.js'
import { gatheredBrief, KIT_ROOT, needsReading } from './build-draft-engine-fixtures.mjs'

after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

const SITE = 'https://larkfen-racquets.example/'

test('research gives the needs profile the owner own videos and the held back codes', async () => {
  const gathered = gatheredBrief()
  gathered.brief.assets = [
    {
      id: 'v1',
      kind: 'video',
      source: 'website',
      uploaderRole: 'owner',
      content: 'space',
      caption: 'A rally'
    }
  ]
  gathered.brief.missing = [{ field: 'prices', why: 'No supported price is available: show no price.' }]
  gathered.manifest = [{ id: 'v1', sourceUrl: `${SITE}video/rally.mp4` }]
  const record = await researchStep(
    { links: [SITE] },
    { gather: async () => gathered, model: async () => JSON.stringify(needsReading()), kit: null }
  )
  assert.equal(record.profile.videos.count, 1)
  assert.deepEqual(record.profile.videos.sources, [{ id: 'website', origin: 'website', count: 1 }])
  assert.deepEqual(record.profile.heldBack, [{ field: 'prices', code: 'not_collected', count: 1 }])
})
