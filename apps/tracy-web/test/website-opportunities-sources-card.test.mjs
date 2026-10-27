// The research Steps card's source list and the rule that says when a source is tried again. No database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PLACE_SETTLED_REASONS,
  SOURCE_MAX_AGE_MS,
  SOURCE_RETRY_MS,
  shownSourceRowsOf,
  sourceDue
} from 'website-opportunities/src/places.js'
import { SHOWN_SOURCES, SOURCES } from 'website-opportunities/src/sources.js'
import { SHOWN_SOURCES as CLIENT_SHOWN_SOURCES } from '../../../packages/site/tracy-website-opportunities/src/client/status.ts'
import { TRIPADVISOR_VERSION } from 'website-opportunities/src/tripadvisor.js'

const NOW = Date.parse('2026-10-23T12:00:00Z')
const at = (msAgo) => new Date(NOW - msAgo)

test('the card lists every source a place research ran, in a fixed order, and nothing else', () => {
  // The plugin draws Retry only on the sources it knows: both lists must name the same sources in the same order.
  assert.deepEqual(SHOWN_SOURCES, [...CLIENT_SHOWN_SOURCES])
  // test-quality: contract profile, brief and outreach read SOURCES; the card's wider list must not leak into them
  assert.deepEqual(SOURCES, ['website', 'facebook', 'instagram', 'tiktok', 'youtube'])
  const rows = shownSourceRowsOf([
    { source: 'tripadvisor', status: 'skipped', reason: 'not_found', attempted_at: at(0) },
    { source: 'google-places-search', status: 'complete', collected_at: at(0) },
    { source: 'website', ref: 'http://cafe.test/', status: 'complete', collected_at: at(0) },
    {
      source: 'facebook',
      ref: 'https://www.facebook.com/cafe',
      status: 'blocked',
      reason: 'credential_invalid'
    },
    { source: 'google-maps', ref: 'https://www.google.com/maps/x', status: 'complete', collected_at: at(0) },
    { source: 'google-places', ref: 'ChIJcafe', status: 'complete', collected_at: at(0) },
    {
      source: 'instagram',
      ref: 'https://www.instagram.com/cafe',
      status: 'blocked',
      reason: 'credential_invalid'
    }
  ])
  assert.deepEqual(
    rows.map((r) => [r.source, r.status, r.reason ?? null]),
    [
      ['website', 'complete', null],
      ['facebook', 'blocked', 'credential_invalid'],
      ['instagram', 'blocked', 'credential_invalid'],
      ['google-places', 'complete', null],
      ['google-maps', 'complete', null],
      ['tripadvisor', 'skipped', 'not_found']
    ]
  )
})

test('a Google or Tripadvisor call that failed is listed with its reason', () => {
  const rows = shownSourceRowsOf([
    { source: 'google-places', ref: 'ChIJcafe', status: 'failed', reason: 'error', attempted_at: at(0) },
    { source: 'tripadvisor', status: 'failed', reason: 'HTTP_402', attempted_at: at(0) }
  ])
  assert.deepEqual(
    rows.map((r) => [r.source, r.status, r.reason]),
    [
      ['google-places', 'failed', 'error'],
      ['tripadvisor', 'failed', 'HTTP_402']
    ]
  )
})

test('a source the place itself has nothing at is settled for thirty days', () => {
  for (const [status, reason] of [
    ['skipped', 'not_found'],
    ['failed', 'not_found'],
    ['blocked', 'private_or_empty'],
    ['skipped', 'ambiguous']
  ]) {
    const row = { source: 'facebook', status, reason, attempted_at: at(2 * SOURCE_RETRY_MS) }
    assert.equal(sourceDue(row, NOW), false, `${status}/${reason} two days ago`)
    assert.equal(
      sourceDue({ ...row, attempted_at: at(SOURCE_MAX_AGE_MS + 1) }, NOW),
      true,
      `${status}/${reason} a month ago`
    )
  }
})

test('a source our setup failed on is tried again on the next research after a day', () => {
  for (const [status, reason] of [
    ['blocked', 'credential_invalid'],
    ['blocked', 'credential_missing'],
    ['partial', 'quota'],
    ['failed', 'provider_error'],
    ['partial', 'timeout'],
    ['failed', 'error'],
    ['failed', 'HTTP_402'],
    ['skipped', 'switched_off']
  ]) {
    const row = { source: 'facebook', status, reason, attempted_at: at(SOURCE_RETRY_MS + 1) }
    assert.equal(sourceDue(row, NOW), true, `${status}/${reason}`)
    assert.equal(
      sourceDue({ ...row, attempted_at: at(60_000) }, NOW),
      false,
      `${status}/${reason} a minute ago`
    )
  }
})

test('a refresh that found the page gone keeps the old data and waits thirty days, a refresh our key failed waits a day', () => {
  const collected = { source: 'facebook', status: 'complete', collected_at: at(SOURCE_MAX_AGE_MS + 1) }
  const gone = { ...collected, attempted_at: at(2 * SOURCE_RETRY_MS), last_error: { reason: 'not_found' } }
  const key = {
    ...collected,
    attempted_at: at(2 * SOURCE_RETRY_MS),
    last_error: { reason: 'credential_invalid' }
  }
  assert.equal(sourceDue(gone, NOW), false)
  assert.equal(sourceDue(key, NOW), true)
})

test('Tripadvisor not finding the place at this version waits thirty days, a provider failure a day', () => {
  const notFound = {
    source: 'tripadvisor',
    status: 'skipped',
    reason: 'not_found',
    attempted_at: at(2 * SOURCE_RETRY_MS),
    last_error: { status: 'skipped', reason: 'not_found', version: TRIPADVISOR_VERSION }
  }
  assert.equal(sourceDue(notFound, NOW, TRIPADVISOR_VERSION), false)
  const paid = {
    ...notFound,
    status: 'failed',
    reason: 'HTTP_402',
    last_error: { status: 'failed', reason: 'HTTP_402', version: TRIPADVISOR_VERSION }
  }
  assert.equal(sourceDue(paid, NOW, TRIPADVISOR_VERSION), true)
})

test('the client lists the same sources and the same place reasons as the server', async () => {
  const client = await import('../../../packages/site/tracy-website-opportunities/src/client/status.ts')
  assert.deepEqual([...client.SHOWN_SOURCES], [...SHOWN_SOURCES])
  assert.deepEqual([...client.PLACE_SETTLED_REASONS], [...PLACE_SETTLED_REASONS])
})
