// Research again: which parts of a place a pressed button looks at again, and why. No database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SOURCE_MAX_AGE_MS, SOURCE_RETRY_MS, sourceDue } from 'website-opportunities/src/places.js'
import { researchAgainPlan } from 'website-opportunities/src/research-again.js'

const NOW = Date.parse('2026-10-24T12:00:00Z')
const at = (msAgo) => new Date(NOW - msAgo)
const HOUR = 3600_000

test('a press runs a source our setup failed on an hour ago; the automatic rule still waits a day', () => {
  const row = { source: 'tripadvisor', status: 'failed', reason: 'provider_error', attempted_at: at(HOUR) }
  assert.equal(sourceDue(row, NOW), false)
  assert.equal(sourceDue(row, NOW, null, { manual: true }), true)
})

test('a press never looks again within thirty days at what the place itself does not have', () => {
  const row = {
    source: 'facebook',
    status: 'skipped',
    reason: 'not_found',
    attempted_at: at(2 * SOURCE_RETRY_MS)
  }
  assert.equal(sourceDue(row, NOW, null, { manual: true }), false)
  assert.equal(sourceDue(row, NOW, 'v2', { manual: true }), true, 'unless the rule that looked has changed')
})

test('the plan names each part to run with its reason and price, and each part kept with its reason', () => {
  const plan = researchAgainPlan(
    {
      'google-places': { status: 'complete', collected_at: at(HOUR), attempted_at: at(HOUR) },
      tripadvisor: {
        status: 'failed',
        reason: 'provider_error',
        attempted_at: at(HOUR),
        collector_version: 'tripadvisor-5'
      },
      website: {
        status: 'complete',
        collected_at: at(SOURCE_MAX_AGE_MS + HOUR),
        attempted_at: at(SOURCE_MAX_AGE_MS + HOUR)
      },
      youtube: { status: 'skipped', reason: 'not_found', attempted_at: at(2 * 24 * HOUR) },
      'google-maps': { status: 'complete', collected_at: at(HOUR), collector_version: 'google-maps-0' }
    },
    {
      now: NOW,
      parts: [
        'website',
        'youtube',
        'google-places',
        'google-maps',
        'tripadvisor',
        'instagram-search',
        'tiktok'
      ],
      versions: { tripadvisor: 'tripadvisor-5', 'google-maps': 'google-maps-1' },
      unavailable: { tiktok: 'credential_missing' },
      prices: { website: 3, tripadvisor: 2, 'instagram-search': 4, 'google-maps': 5 }
    }
  )
  assert.deepEqual(plan.run, [
    { part: 'website', reason: 'outdated', ceilingCents: 3 },
    { part: 'google-maps', reason: 'rule-changed', ceilingCents: 5 },
    { part: 'tripadvisor', reason: 'failed', ceilingCents: 2 },
    { part: 'instagram-search', reason: 'never', ceilingCents: 4 }
  ])
  assert.deepEqual(plan.kept, [
    { part: 'youtube', reason: 'none' },
    { part: 'google-places', reason: 'up-to-date' },
    { part: 'tiktok', reason: 'unavailable', detail: 'credential_missing' }
  ])
  assert.equal(plan.ceilingCents, 14)
})

test('a place with nothing due has an empty plan', () => {
  const plan = researchAgainPlan(
    { website: { status: 'complete', collected_at: at(HOUR), attempted_at: at(HOUR) } },
    { now: NOW, parts: ['website'] }
  )
  assert.deepEqual(plan.run, [])
  assert.equal(plan.ceilingCents, 0)
})

test('a refresh that found a collected page gone is "none", not failed, for thirty days', () => {
  const plan = researchAgainPlan(
    {
      facebook: {
        status: 'complete',
        collected_at: at(SOURCE_MAX_AGE_MS + HOUR),
        attempted_at: at(HOUR),
        last_error: { reason: 'not_found' }
      }
    },
    { now: NOW, parts: ['facebook'] }
  )
  assert.deepEqual(plan.kept, [{ part: 'facebook', reason: 'none' }])
})

test('a plan over a cap drops its dearest parts first and says so', () => {
  const plan = researchAgainPlan(
    {},
    {
      now: NOW,
      parts: ['website', 'facebook-search', 'tripadvisor'],
      prices: { website: 3, 'facebook-search': 8, tripadvisor: 2 },
      capCents: 6
    }
  )
  assert.deepEqual(
    plan.run.map((r) => r.part),
    ['website', 'tripadvisor']
  )
  assert.deepEqual(plan.kept.at(-1), { part: 'facebook-search', reason: 'over-cap' })
  assert.equal(plan.ceilingCents, 5)
})
