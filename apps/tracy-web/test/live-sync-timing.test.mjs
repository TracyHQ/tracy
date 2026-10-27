/**
 * Where a Sync from live's time went, kept with its row (`timingOf`, `view().timing`): read back from
 * tracy-web when a sync was slow, with no shell on the host (David, 23/10/2026). No database.
 *
 *   node --test apps/tracy-web/test/live-sync-timing.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastJson, stageOf, timingOf, view } from '../src/sites/live-sync.js'

const OUTPUT = [
  '==> [0s] reading the live site',
  '{"ok":true,"liveReadAt":"2026-10-23T09:00:00.000Z","timing":{"fingerprint":2.1,"database":7.6,"files":0},"seconds":9.8,"mode":"files-unchanged"}',
  '==> [10s] the copy: sealing its files',
  '==> restore everything: swap done (1486 ms)',
  '==> [47s] restored; what Joomla must redo',
  '{"ok":true,"state":"applied","files":{"fromTheirs":0}}'
].join('\n')

test('the steps with their seconds, and the live read in parts', () => {
  assert.deepEqual(timingOf(OUTPUT), {
    steps: [
      { at: 0, step: 'reading the live site', stage: 'reading' },
      { at: 10, step: 'the copy: sealing its files', stage: 'merging' },
      { at: 47, step: 'restored; what Joomla must redo', stage: 'applying' }
    ],
    read: { mode: 'files-unchanged', seconds: 9.8, parts: { fingerprint: 2.1, database: 7.6, files: 0 } }
  })
})

test('an answer by fingerprint alone, and an output with no step: what there is, never invented', () => {
  assert.deepEqual(
    timingOf('{"ok":true,"unchanged":"fingerprint","liveReadAt":"x","timing":{"fingerprint":2},"seconds":2}')
      .read,
    { mode: 'unchanged', seconds: 2, parts: { fingerprint: 2 } }
  )
  assert.deepEqual(timingOf(''), { steps: [], read: null })
  assert.deepEqual(timingOf(undefined), { steps: [], read: null })
})

test('the view carries the timing kept with the answer, and null for a row without one', () => {
  const row = {
    id: 's1',
    state: 'applied',
    created_at: '2026-10-23T09:00:00Z',
    updated_at: '2026-10-23T09:00:47Z',
    answer: { files: {}, timing: timingOf(OUTPUT) }
  }
  assert.equal(view(row).timing.steps.at(-1).at, 47)
  assert.equal(view({ ...row, answer: { files: {} } }).timing, null)
})

test('every step webroot-sync.sh prints falls in the dialog stage it belongs to (#1649)', () => {
  const said = {
    'reading the live site': 'reading',
    'the live site read (9.8 s)': 'reading',
    "the held sync's read: asking the live site whether it moved since": 'reading',
    'the live site moved since the held sync, or cannot say: reading it again': 'reading',
    "the held sync's merge: checking the copy did not move since": 'merging',
    'the copy moved since the held sync (its database): merging again on its read': 'merging',
    'keeping the read and the merge for Sync anyway': 'merging',
    // The engine's own phases, on the sync's clock (live_sync.py `phase`).
    'db merge: clashes numbered at 3.1s (46 SQL calls)': 'merging',
    "waiting for another site's heavy webroot job (one at a time per machine)": 'merging',
    'the copy: sealing its files': 'merging',
    'the copy: dumping its database': 'merging',
    'the live read: its files as a tree': 'merging',
    'base: last-sync (abc123)': 'merging',
    'files merged; loading the three databases': 'merging',
    'merging the databases': 'merging',
    'making the backup point of the result': 'merging',
    'the copy moved between merge and apply; merging again': 'merging',
    '3 table(s) differ from the point': 'applying',
    'putting the result in place (Restore everything to v4)': 'applying',
    'restored; what Joomla must redo': 'applying',
    // Settling a sync a restart cut off is no stage of this one.
    'the last sync was cut off once in place: finishing it from its run': null
  }
  for (const [step, stage] of Object.entries(said)) assert.equal(stageOf(step), stage, step)
})

test('the steps the script prints are the ones the stages know (no step left without one)', async () => {
  const { readFileSync } = await import('node:fs')
  const script = readFileSync(
    new URL('../../../packages/fleet/tracy-fleet-operation/scripts/webroot/webroot-sync.sh', import.meta.url),
    'utf8'
  )
  const printed = [...script.matchAll(/echo "==> \[\$\{SECONDS\}s\] ([^"$]+)/g)].map((m) => m[1])
  assert.ok(printed.length > 10, printed.join(' | '))
  const outside = printed.filter((step) => stageOf(step) === null)
  // Only the steps of settling a cut-off sync, or of a copy dumped again, stand outside the stages.
  for (const step of outside)
    assert.match(step, /^(the last sync was cut off|only the sync wrote there|files )/, step)
})

test('the live read’s timing line is progress, never the answer of a script that stopped after it', () => {
  const read =
    '{"ok":true,"liveReadAt":"2026-10-23T09:00:00Z","mode":"incremental","timing":{"database":1},"seconds":2}'
  assert.equal(
    lastJson(`==> [0s] reading the live site\n${read}\n==> [2s] the live site read\nTraceback`),
    null
  )
  assert.deepEqual(lastJson(`${read}\n{"ok":false,"code":"MERGE_FAILED"}`), {
    ok: false,
    code: 'MERGE_FAILED'
  })
  assert.equal(
    lastJson(`${read}\n{"ok":true,"state":"applied","unchanged":"fingerprint","liveReadAt":"x","read":{}}`)
      .state,
    'applied'
  )
})
