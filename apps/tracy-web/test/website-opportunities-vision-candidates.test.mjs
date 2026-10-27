import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visionPictureCandidates } from '../src/opportunities-build/site-pictures.js'

test('vision selection considers late landscape photos as well as large square and portrait candidates', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `square-${i}`, width: 2000, height: 2000 }))
  rows.push({ id: 'wide', width: 1600, height: 900 }, { id: 'portrait', width: 900, height: 1200 })
  const chosen = visionPictureCandidates(rows, { key: 'v1', maxPictures: 3 })
  assert.deepEqual(
    chosen.map((r) => r.id),
    ['wide', 'square-0', 'portrait']
  )
  assert.equal(rows.length, 102, 'selection does not truncate or mutate the source inventory')
})

test('vision selection reuses current cache, excludes tiny images and sends one near duplicate', () => {
  const rows = [
    { id: 'cached', width: 2000, height: 1000, labels: { vision: { key: 'v1' } } },
    { id: 'tiny', width: 100, height: 100 },
    { id: 'large', width: 1600, height: 900, dhash: '0'.repeat(16) },
    { id: 'copy', width: 1200, height: 675, dhash: '0'.repeat(15) + '1' },
    { id: 'stale', width: 1000, height: 1000, labels: { vision: { key: 'old' } } }
  ]
  const chosen = visionPictureCandidates(rows, { key: 'v1' })
  assert.deepEqual(
    chosen.map((r) => r.id),
    ['large', 'stale']
  )
})

test('the release geometry directs the bounded shortlist, including an empty quota', () => {
  const rows = [
    { id: 'square', width: 2000, height: 2000 },
    { id: 'portrait', width: 800, height: 1200 }
  ]
  assert.equal(
    visionPictureCandidates(rows, { key: 'v1', maxPictures: 1, needs: [{ width: 600, height: 900 }] })[0].id,
    'portrait'
  )
  assert.deepEqual(visionPictureCandidates(rows, { key: 'v1', maxPictures: 0 }), [])
})
