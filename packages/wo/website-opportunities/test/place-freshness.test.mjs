// How old a place snapshot's data is (`snapshotFresh`) is a separate question from whether a run is due now
// (`snapshotDue`): a failed retry postpones the next try, it never makes old data new.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SOURCE_MAX_AGE_MS, SOURCE_RETRY_MS, snapshotDue, snapshotFresh } from '../src/places.js'

const NOW = Date.parse('2026-10-24T12:00:00Z')
const HOUR = 3_600_000
const at = (ago) => new Date(NOW - ago)
const published = (sources) => ({
  state: 'published',
  enrichment_scope: 'full',
  published_at: at(HOUR),
  sources
})

test('a source collected long ago whose retry just failed is stale data, though not due again yet', () => {
  const snapshot = published([
    {
      source: 'google-places',
      status: 'complete',
      collected_at: at(SOURCE_MAX_AGE_MS + 5 * 24 * HOUR),
      attempted_at: at(HOUR),
      last_error: { reason: 'timeout' }
    }
  ])
  assert.equal(snapshotFresh(snapshot, NOW), false)
  assert.equal(snapshotDue(snapshot, NOW), false, 'the retry waits out its cooldown')
  assert.equal(snapshotDue(snapshot, NOW + SOURCE_RETRY_MS), true, 'and is due once it has')
})

test('a recent collection is fresh and not due', () => {
  const snapshot = published([
    {
      source: 'website',
      status: 'complete',
      collected_at: at(2 * 24 * HOUR),
      attempted_at: at(2 * 24 * HOUR)
    }
  ])
  assert.equal(snapshotFresh(snapshot, NOW), true)
  assert.equal(snapshotDue(snapshot, NOW), false)
})

test('a settled "the place has nothing there" answer is fresh within the max age, stale after', () => {
  const snapshot = published([
    {
      source: 'facebook',
      status: 'failed',
      attempted_at: at(3 * 24 * HOUR),
      last_error: { reason: 'not_found' }
    }
  ])
  assert.equal(snapshotFresh(snapshot, NOW), true)
  assert.equal(snapshotFresh(snapshot, NOW + SOURCE_MAX_AGE_MS), false)
  assert.equal(snapshotDue(snapshot, NOW + SOURCE_MAX_AGE_MS), true)
})

test('a source that failed on our setup and never collected is not fresh, and waits a day to be tried', () => {
  const snapshot = published([
    { source: 'instagram', status: 'failed', attempted_at: at(HOUR), last_error: { reason: 'quota' } }
  ])
  assert.equal(snapshotFresh(snapshot, NOW), false)
  assert.equal(snapshotDue(snapshot, NOW), false)
})

test('an unpublished or background-only snapshot is neither fresh nor spared a run', () => {
  const rows = [{ source: 'website', status: 'complete', collected_at: at(HOUR), attempted_at: at(HOUR) }]
  for (const snapshot of [
    { ...published(rows), state: 'preparing' },
    { ...published(rows), enrichment_scope: 'prefetch' }
  ]) {
    assert.equal(snapshotFresh(snapshot, NOW), false)
    assert.equal(snapshotDue(snapshot, NOW), true)
  }
  assert.equal(snapshotFresh(null, NOW), false)
  assert.equal(snapshotDue(null, NOW), true)
})
