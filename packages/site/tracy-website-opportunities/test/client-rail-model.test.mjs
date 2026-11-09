/**
 * The "On this page" rail of Details (layout B, spec #512): one page with every section stacked, and a rail that lists
 * them in order with one status line each, read from the same inputs as the stepper.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-rail-model.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SECTION_IDS, activeSection, railView, sourceCounts } from '../src/client/rail-model.ts'
import { briefSummaryRows } from '../src/client/business-brief-model.ts'
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
/** The status line as the rail draws it, from the English strings. */
const line = (entry) =>
  entry.status
    .map(({ key, params = {} }) =>
      STRINGS[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
    )
    .join(', ')

test('five sections in page order: Profile, Sources, Business brief, Photos & video, Demo site', () => {
  assert.deepEqual(SECTION_IDS, ['profile', 'sources', 'brief', 'media', 'demo'])
  assert.deepEqual(
    railView(base).map((e) => e.id),
    SECTION_IDS
  )
  for (const id of SECTION_IDS) assert.equal(typeof STRINGS[`details.section.${id}`], 'string')
})

test('brief ready: counts, the brief with its date, and the demo not built', () => {
  const r = by(railView(base))
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
    railView({
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

test('while research runs: partial counts in the brand tone, photos so far', () => {
  const r = by(
    railView({
      ...base,
      research: { state: 'running', done: false },
      researchJob: { state: 'running' },
      profile: { filled: 3, total: 7 },
      sources: { found: 2, settled: 2, total: 5 },
      brief: null,
      media: { photos: 5, videos: 0 }
    })
  )
  assert.equal(line(r.profile), '3 of 7')
  assert.equal(line(r.sources), '2 of 5 done')
  assert.equal(line(r.media), '5 so far')
  assert.equal(line(r.brief), 'Locked')
  assert.equal(r.sources.tone, 'run')
  assert.equal(r.media.locked, false)
})

test('a brief being made reads Running; a building demo Building; a ready one Ready', () => {
  const running = by(
    railView({ ...base, brief: null, briefJob: { id: 'j1', state: 'running', step: 'reading' } })
  )
  assert.equal(line(running.brief), 'Running')
  assert.equal(running.brief.tone, 'run')
  assert.equal(running.demo.locked, true)
  assert.equal(line(by(railView({ ...base, demo: 'building' })).demo), 'Building')
  const ready = by(railView({ ...base, demo: 'ready' }))
  assert.equal(line(ready.demo), 'Ready')
  assert.equal(ready.demo.tone, 'ok')
})

test('one of a kind reads in the singular, and no videos leaves them out', () => {
  const r = by(railView({ ...base, profile: { filled: 1, total: 8 }, media: { photos: 1, videos: 0 } }))
  assert.equal(line(r.profile), '1 field')
  assert.equal(line(r.media), '1 photo')
})

test('the brief date follows the interface locale', () => {
  assert.equal(line(by(railView({ ...base, locale: 'en-US' })).brief), 'Brief 14, Nov 9')
})

test('a brief with no readable date reads by its number alone', () => {
  assert.equal(line(by(railView({ ...base, brief: { id: 'b2', n: 2, createdAt: null } })).brief), 'Brief 2')
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

test('the section in view is the last one past the reading line; the last one at the end of the page', () => {
  const tops = [
    { id: 'profile', top: -400 },
    { id: 'sources', top: -10 },
    { id: 'brief', top: 300 },
    { id: 'media', top: 900 },
    { id: 'demo', top: 1300 }
  ]
  assert.equal(activeSection(tops), 'sources')
  assert.equal(activeSection(tops.map((s) => ({ ...s, top: s.top + 1000 }))), 'profile')
  assert.equal(activeSection(tops, true), 'demo')
  assert.equal(activeSection([]), 'profile')
})

test('the collapsed Business brief: one row each of name, description, services and team, else its first rows', () => {
  const row = (field) => ({
    id: field,
    field,
    label: field,
    value: field,
    source: '',
    onSite: true,
    ownerChoice: false,
    notes: []
  })
  const rows = ['name', 'address', 'phone', 'hours', 'bio', 'services', 'services', 'audience', 'team'].map(
    row
  )
  assert.deepEqual(
    briefSummaryRows(rows).map((r) => r.field),
    ['name', 'bio', 'services', 'team']
  )
  const other = ['address', 'phone', 'hours', 'website', 'email'].map(row)
  assert.deepEqual(
    briefSummaryRows(other).map((r) => r.field),
    ['address', 'phone', 'hours', 'website']
  )
})

test('rail and section strings are English with no dash', () => {
  const keys = Object.keys(STRINGS).filter((k) => /^(rail|section|details\.section)\./.test(k))
  assert.ok(keys.length > 20)
  for (const k of keys) assert.doesNotMatch(STRINGS[k], /[–—]/, k)
})
