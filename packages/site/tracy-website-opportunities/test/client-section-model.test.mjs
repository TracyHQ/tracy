/**
 * The sections of Details (layout C, spec #512): each card's status line, read from the same inputs as the stepper,
 * and the four sections that open as a sub-page with a pager in order.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-section-model.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SECTION_IDS,
  SUB_SECTIONS,
  isSubSection,
  sectionMetas,
  sourceCounts
} from '../src/client/section-model.ts'
import { en as STRINGS } from '../src/client/strings.ts'

const DONE = { state: 'done', done: true }
const base = {
  research: DONE,
  researchJob: { state: 'completed' },
  profile: { filled: 7, total: 8 },
  sources: { found: 3, settled: 5, total: 5 },
  briefJob: null,
  brief: { id: 'b14', n: 14, createdAt: '2026-11-09T10:00:00Z' },
  media: { photos: 22, videos: 2 },
  demo: 'none',
  locale: 'en-GB'
}
const by = (entries) => Object.fromEntries(entries.map((e) => [e.id, e]))
/** The status line as a card draws it, from the English strings. */
const line = (entry) =>
  entry.status
    .map(({ key, params = {} }) =>
      STRINGS[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
    )
    .join(', ')

test('five sections in page order: Profile, Sources, Business brief, Photos & video, Demo site', () => {
  // test-quality: contract the order of the Details sections the owner approved (#522)
  assert.deepEqual(SECTION_IDS, ['profile', 'sources', 'brief', 'media', 'demo'])
  assert.deepEqual(
    sectionMetas(base).map((e) => e.id),
    SECTION_IDS
  )
  for (const id of SECTION_IDS) assert.equal(typeof STRINGS[`details.section.${id}`], 'string')
})

test('brief ready: counts, the brief with its date, and the demo not built', () => {
  const r = by(sectionMetas(base))
  assert.equal(line(r.profile), '7 fields')
  assert.equal(line(r.sources), '3 of 5 found')
  assert.equal(line(r.brief), 'Brief 14, 9 Nov')
  assert.equal(line(r.media), '22 photos, 2 videos')
  assert.equal(line(r.demo), 'Not built')
  assert.equal(r.profile.tone, 'ok')
  assert.equal(r.demo.tone, 'mute')
  assert.equal(
    Object.values(r).some((e) => e.locked),
    false
  )
})

test('a new place: nothing collected, the later sections locked', () => {
  const r = by(
    sectionMetas({
      ...base,
      research: { state: 'not_started', done: false },
      researchJob: null,
      profile: { filled: 0, total: 8 },
      sources: { found: 0, settled: 0, total: 3 },
      brief: null,
      media: { photos: 0, videos: 0 }
    })
  )
  assert.equal(line(r.profile), 'Available after research')
  assert.equal(line(r.sources), 'Not collected yet')
  assert.equal(line(r.brief), 'Locked')
  assert.equal(line(r.media), 'None yet')
  assert.equal(line(r.demo), 'Not built')
  assert.deepEqual([r.brief.locked, r.media.locked, r.demo.locked], [true, true, true])
  assert.equal(r.profile.locked, false)
})

test('while research runs: the cards hold nothing partial, the band carries the progress (#537)', () => {
  const r = by(
    sectionMetas({
      ...base,
      research: { state: 'running', done: false },
      researchJob: { state: 'running' },
      profile: { filled: 3, total: 7 },
      sources: { found: 2, settled: 2, total: 5 },
      brief: null,
      media: { photos: 5, videos: 0 }
    })
  )
  assert.equal(line(r.profile), 'Available after research')
  assert.equal(line(r.sources), 'Not collected yet')
  assert.equal(line(r.media), 'None yet')
  assert.equal(line(r.brief), 'Locked')
  assert.equal(r.sources.tone, 'mute')
  assert.equal(r.media.locked, false)
})

test('research run again: the cards reset until it finishes (#537)', () => {
  const r = by(sectionMetas({ ...base, research: DONE, researchJob: { state: 'running' } }))
  assert.equal(line(r.profile), 'Available after research')
  assert.equal(line(r.sources), 'Not collected yet')
  assert.equal(line(r.media), 'None yet')
})

test('a brief being made or failed reads Not made yet; a building demo Not built; a ready one Ready (#537)', () => {
  const running = by(
    sectionMetas({ ...base, brief: null, briefJob: { id: 'j1', state: 'running', step: 'reading' } })
  )
  assert.equal(line(running.brief), 'Not made yet')
  assert.equal(running.brief.tone, 'mute')
  assert.equal(running.demo.locked, true)
  // Made again over an older brief: the older one is reset on screen while the job runs.
  const again = by(sectionMetas({ ...base, briefJob: { id: 'j2', state: 'running', step: 'writing' } }))
  assert.equal(line(again.brief), 'Not made yet')
  assert.equal(line(by(sectionMetas({ ...base, demo: 'building' })).demo), 'Not built')
  const ready = by(sectionMetas({ ...base, demo: 'ready' }))
  assert.equal(line(ready.demo), 'Ready')
  assert.equal(ready.demo.tone, 'ok')
})

test('one of a kind reads in the singular, and no videos leaves them out', () => {
  const r = by(sectionMetas({ ...base, profile: { filled: 1, total: 8 }, media: { photos: 1, videos: 0 } }))
  assert.equal(line(r.profile), '1 field')
  assert.equal(line(r.media), '1 photo')
})

test('the brief date follows the interface locale', () => {
  assert.equal(line(by(sectionMetas({ ...base, locale: 'en-US' })).brief), 'Brief 14, Nov 9')
})

test('a brief with no readable date reads by its number alone', () => {
  assert.equal(
    line(by(sectionMetas({ ...base, brief: { id: 'b2', n: 2, createdAt: null } })).brief),
    'Brief 2'
  )
})

test('source counts: found gave data, settled is no longer waiting', () => {
  assert.deepEqual(
    sourceCounts([
      { source: 'google', status: 'complete' },
      { source: 'instagram', status: 'partial' },
      { source: 'tripadvisor', status: 'skipped' },
      { source: 'website' }
    ]),
    { found: 2, settled: 3, total: 4 }
  )
})

test('section strings are English with no dash', () => {
  const keys = Object.keys(STRINGS).filter((k) => /^(section|details\.section|progress)\./.test(k))
  assert.ok(keys.length > 20)
  for (const k of keys) assert.doesNotMatch(STRINGS[k], /[–—]/, k)
})

test('three sections open as a sub-page, Sources is no sub-page', () => {
  // test-quality: contract the order of the Details sections the owner approved (#522)
  assert.deepEqual(SUB_SECTIONS, ['profile', 'brief', 'media'])
  assert.equal(isSubSection('brief'), true)
  assert.equal(isSubSection('demo'), false)
  assert.equal(isSubSection('rail'), false)
  // The Sources table on Details is the whole of Sources (#537).
  assert.equal(isSubSection('sources'), false)
})

test('every rail string is gone with the rail', () => {
  assert.deepEqual(
    Object.keys(STRINGS).filter((k) => k.startsWith('rail.') || k.startsWith('section.show')),
    []
  )
})
