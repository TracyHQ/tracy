#!/usr/bin/env node
/**
 * The pieces a place shows in My opportunities (`src/client/opportunity-pieces.ts`, spec #512, #518, #537): Place,
 * the step it reached, Demo, Status with its one next action, read from a row shaped like `GET /api/website-opportunities`.
 * Secondary fields come from the same row for the Columns menu.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-opportunity-pieces.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createTranslate } from '@tracy/wo-views/strings'
import { placePieces, secondaryLines } from '../src/client/opportunity-pieces.ts'
import { en } from '../src/client/strings.ts'

const t = createTranslate(en)
const NOW = Date.parse('2026-11-09T12:00:00Z')
const D = 24 * 3_600_000
const iso = (ms) => new Date(ms).toISOString()
const opts = { now: NOW, locale: 'en' }

const candidate = (over = {}) => ({
  provider: 'google-places',
  providerId: 'ChIJfake001',
  name: 'Sunny Fork Bistro',
  category: 'Bistro',
  address: '12 Example Lane, Sampletown',
  website: 'https://sunnyfork.example',
  rating: 4.7,
  reviews: 1802,
  ...over
})
const researched = (over = {}) => ({
  id: 'b7d2f1a0-0000-4000-8000-000000000001',
  name: 'Sunny Fork Bistro',
  candidate: candidate(),
  job: { id: 'j1', state: 'completed', updatedAt: iso(NOW - 2 * D) },
  latestRevision: { id: 'r1', n: 1 },
  stage: 'demo',
  score: { score: 33, grade: 'C', pending: false, reasons: [] },
  ...over
})

test('Place: name, type, address and a Google Maps link for the pin', () => {
  const { place } = placePieces(researched(), t, opts)
  assert.equal(place.name, 'Sunny Fork Bistro')
  assert.equal(place.type, 'Bistro')
  assert.equal(place.address, '12 Example Lane, Sampletown')
  const url = new URL(place.mapsUrl)
  assert.equal(url.origin, 'https://www.google.com')
  assert.equal(url.searchParams.get('query_place_id'), 'ChIJfake001')
})

test('Place: the place page Google gave wins as the pin link', () => {
  const row = researched({ candidate: candidate({ mapsUrl: 'https://maps.google.com/?cid=123' }) })
  assert.equal(placePieces(row, t, opts).place.mapsUrl, 'https://maps.google.com/?cid=123')
})

test('Step: a place carries the step it reached, not a score or a social summary (#537, option A)', () => {
  const p = placePieces(researched(), t, opts)
  assert.equal('opportunity' in p, false)
  assert.equal(t(p.step.kickerKey, p.step.kickerParams), 'Step 3 of 3')
  assert.deepEqual(p.step.segments, ['done', 'done', 'current'])
})

test('Demo and Status: a brief and no demo yet, the next action is Build demo', () => {
  const p = placePieces(researched(), t, opts)
  assert.deepEqual(p.demo, { kind: 'none' })
  assert.equal(p.status.label, 'Brief ready')
  assert.deepEqual(p.next, {
    label: 'Build your site',
    run: { kind: 'demo', action: 'build' },
    disabled: false,
    look: 'primary'
  })
})

test('Status: researched without a brief offers Make content brief, never Build demo (same steps as Details)', () => {
  const p = placePieces(
    researched({ latestRevision: null, research: { state: 'done', researchedAt: iso(NOW - D) } }),
    t,
    opts
  )
  assert.equal(p.status.label, 'Researched')
  assert.deepEqual(p.next, {
    label: 'Make site content brief',
    run: { kind: 'brief' },
    disabled: false,
    look: 'primary'
  })
})

test('Status: a place never researched offers Start research', () => {
  const p = placePieces(
    researched({
      stage: 'research',
      job: null,
      latestRevision: null,
      research: { state: 'not_started', researchedAt: null }
    }),
    t,
    opts
  )
  assert.equal(p.status.label, 'Not started')
  assert.deepEqual(p.next, {
    label: 'Research business facts',
    run: { kind: 'row', action: 'start' },
    disabled: false,
    look: 'primary'
  })
})

test('Demo: a live demo shows its thumbnail address and days left; Status Demo ready, next Open demo', () => {
  const row = researched({
    stage: 'outreach',
    demoAction: { id: 'a1', state: 'completed', step: 'check' },
    demo: {
      siteKey: 'sunny-fork.tracy.site',
      url: 'https://sunny-fork.tracy.site',
      expiresAt: iso(NOW + 14 * D - 60_000),
      frozenAt: null,
      deletedAt: null,
      qa: 'passed',
      build: { status: 'done', startedAt: iso(NOW - D) }
    }
  })
  const p = placePieces(row, t, opts)
  assert.deepEqual(p.demo, {
    kind: 'thumb',
    url: 'https://sunny-fork.tracy.site',
    address: 'sunny-fork.tracy.site',
    daysLeft: 14
  })
  assert.equal(p.status.label, 'Demo ready')
  assert.equal(p.status.tone, 'live')
  // Every step done: the row reads Site ready and opens the site, as the Your site block does (#537).
  assert.deepEqual(p.next, {
    label: 'Open your site ›',
    run: { kind: 'demo', action: 'open' },
    disabled: false,
    look: 'outline'
  })
})

test('Demo: a failed demo shows the reason in words, never the code; next Try again', () => {
  const row = researched({
    demoAction: { id: 'a1', state: 'failed', step: 'kit', error: 'DEMO_STEP_TIMEOUT' }
  })
  const p = placePieces(row, t, opts)
  assert.deepEqual(p.demo, {
    kind: 'failed',
    reason: 'The demo took longer than two hours, so Tracy stopped it.'
  })
  assert.equal(p.status.label, 'Build failed')
  assert.equal(p.status.tone, 'destructive')
  assert.deepEqual(p.next, {
    label: 'Try again',
    run: { kind: 'demo', action: 'build' },
    disabled: false,
    look: 'primary'
  })
})

test('Demo: a build under way is Building, and its button opens Details', () => {
  const row = researched({ demoAction: { id: 'a1', state: 'queued', step: 'brief' } })
  const p = placePieces(row, t, opts)
  assert.deepEqual(p.demo, { kind: 'building' })
  assert.equal(p.status.label, 'Building')
  // A running step: a quiet Open to Details, where the band shows the build steps (#537).
  assert.deepEqual(p.next, { label: 'Open ›', run: { kind: 'details' }, disabled: false, look: 'quiet' })
})

test('Demo: an expired demo says when it expired, and Build again rebuilds it', () => {
  const row = researched({
    demo: {
      siteKey: 'sunny-fork.tracy.site',
      url: 'https://sunny-fork.tracy.site',
      expiresAt: '2026-11-02T10:00:00Z',
      frozenAt: '2026-11-02T10:00:00Z',
      deletedAt: null,
      qa: 'passed',
      build: { status: 'done', startedAt: null }
    }
  })
  const p = placePieces(row, t, opts)
  assert.deepEqual(p.demo, { kind: 'expired', line: 'Demo expired on Nov 2, 2026' })
  assert.equal(p.status.label, 'Demo expired')
  assert.deepEqual(p.next.run, { kind: 'demo', action: 'rebuild' })
})

test('Status: a place still in research waits while it runs, and resumes when it stopped', () => {
  const running = placePieces(
    researched({
      stage: 'research',
      latestRevision: null,
      job: { id: 'j1', state: 'running', stage: 'collection' }
    }),
    t,
    opts
  )
  assert.equal(running.status.label, 'Researching')
  assert.deepEqual(running.next, {
    label: 'Open ›',
    run: { kind: 'details' },
    disabled: false,
    look: 'quiet'
  })
  const stopped = placePieces(
    researched({ stage: 'research', latestRevision: null, job: { id: 'j1', state: 'paused' } }),
    t,
    opts
  )
  assert.deepEqual(stopped.next.run, { kind: 'row', action: 'resume' })
})

test('Status: over the daily build limit, Build demo is disabled', () => {
  const p = placePieces(researched(), t, { ...opts, buildBlocked: true })
  assert.equal(p.next.disabled, true)
})

test('Secondary fields: each one present on the row, in the Columns order, with plain values', () => {
  const row = researched({
    candidate: candidate({ phone: '+1 555 0100', contacts: { whatsapp: '+1 555 0101' } })
  })
  const lines = secondaryLines(row, t, opts, [
    'type',
    'contact',
    'website',
    'phone',
    'rating',
    'source',
    'researched',
    'stage'
  ])
  assert.deepEqual(lines, [
    { id: 'type', label: 'Type', value: 'Bistro' },
    { id: 'contact', label: 'Contact', value: 'WhatsApp +1 555 0101' },
    { id: 'website', label: 'Website', value: 'sunnyfork.example' },
    { id: 'phone', label: 'Phone', value: '+1 555 0100' },
    { id: 'rating', label: 'Rating', value: '4.7 from 1,802 reviews' },
    { id: 'source', label: 'Source', value: 'Google Maps' },
    { id: 'researched', label: 'Researched', value: 'Nov 7, 2026' },
    { id: 'stage', label: 'Stage', value: 'Demo' }
  ])
})

test('Secondary fields: only the asked ones, and a missing value is left out rather than invented', () => {
  const row = researched({ candidate: candidate({ website: null }) })
  assert.deepEqual(secondaryLines(row, t, opts, ['website', 'phone']), [])
})
