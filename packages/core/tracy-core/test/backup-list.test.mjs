#!/usr/bin/env node
/**
 * Backups as the milestones of Site changes — `src/site-tabs/backup-list.ts` (ADR 0024).
 *
 *   node --test packages/core/tracy-core/test/backup-list.test.mjs
 *
 * Quiet failures guarded here: "Full backup" on a point that does not prove its database, Restore
 * everything offered on one, a backup drawn at the bottom of a list it is not the end of, and a
 * backup counted or filtered like an event.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  backupCreateOutcomeOf,
  backupsOf,
  capabilityOf,
  mergeTimeline,
  newestBackupVersion,
  nothingRecordedSince,
  restoreScopes,
  verbsOf
} from '../src/site-tabs/backup-list.ts'
import { changesSince, describe, draftBackupNotes } from '../src/site-tabs/activity-v2.ts'
import { en } from '../../../site/tracy-site-tabs/src/client/strings.ts'

const t = (key, params) =>
  (en[key] ?? key).replace(/\{(\w+)\}/g, (w, n) => (params && n in params ? String(params[n]) : w))
const by = { kind: 'person', name: 'Sam', email: 'sam@example.test' }
const rel = (version, over = {}) => ({
  kind: 'backup',
  version,
  sha: `s${version}`,
  title: `Point ${version}`,
  notes: null,
  at: 1000 * version,
  by,
  files: version,
  ...over
})
const full = { state: 'full', engine: 'mariadb', sha256: 'ab'.repeat(32), size: 100 }

test('capability is read from the point itself; never Full without a proven database', () => {
  assert.equal(capabilityOf(rel(2, { database: full })), 'full')
  assert.equal(capabilityOf(rel(2, { database: { ...full, engine: 'sqlite' } })), 'content')
  assert.equal(capabilityOf(rel(2, { database: { state: 'missing', reason: 'mismatch' } })), 'db-missing')
  assert.equal(capabilityOf(rel(2, { database: { state: 'none' } })), 'files-only')
  assert.equal(capabilityOf(rel(2, { database: { state: 'unknown-host' } })), 'files-only')
  assert.equal(capabilityOf(rel(2)), 'files-only', 'an older server says nothing: a file backup')
})

test('backups: newest first, v1 is the initial backup, a pre-restore point names its target', () => {
  const list = backupsOf([
    rel(1, { database: full }),
    { kind: 'moment', sha: 'm' },
    rel(3, { database: { state: 'missing', reason: 'removed' } }),
    rel(4, { database: full, auto: 'pre-restore', title: 'Before restore to Backup 1' }),
    rel(2)
  ])
  assert.deepEqual(
    list.map((b) => [b.version, b.capability, b.initial, b.beforeRestoreTo, b.previous]),
    [
      [4, 'full', false, 1, 3],
      [3, 'db-missing', false, null, 2],
      [2, 'files-only', false, null, 1],
      [1, 'full', true, null, null]
    ]
  )
  assert.equal(list[1].reason, 'removed')
  // EmDash: files are not tracked, so no file count is said.
  assert.equal(backupsOf([rel(2)], { fileHistory: false })[0].files, null)
})

test('backups: EmDash app snapshot availability stays on its point', () => {
  const points = backupsOf([
    rel(2, { database: { ...full, engine: 'sqlite' }, applicationAvailable: false }),
    rel(1, { database: { ...full, engine: 'sqlite' }, applicationAvailable: true })
  ])
  assert.equal(points[0].applicationAvailable, false)
  assert.equal(points[1].applicationAvailable, true)
})

test('verbs by risk: files where tracked, everything only on a proven full point, content on EmDash', () => {
  assert.deepEqual(verbsOf({ capability: 'full' }), { files: true, everything: true, content: false })
  assert.deepEqual(verbsOf({ capability: 'files-only' }), { files: true, everything: false, content: false })
  assert.deepEqual(verbsOf({ capability: 'db-missing' }), { files: true, everything: false, content: false })
  assert.deepEqual(verbsOf({ capability: 'content' }, { fileHistory: false }), {
    files: false,
    everything: false,
    content: true
  })
  assert.deepEqual(verbsOf({ capability: 'files-only' }, { fileHistory: false }), {
    files: false,
    everything: false,
    content: false
  })
})

const ev = (id, sec) => ({ id, occurredAt: new Date(sec * 1000).toISOString(), detectedAt: null })

test('one line by time; under a Source filter backups fold to dividers; an unfinished list holds back older ones', () => {
  const backups = backupsOf([rel(1), rel(3), rel(5)])
  const items = [ev('a', 4500), ev('b', 2500)]
  const all = mergeTimeline(items, backups, { filter: 'all', complete: true })
  assert.deepEqual(
    all.map((e) => (e.kind === 'event' ? e.item.id : `B${e.backup.version}:${e.as}`)),
    ['B5:row', 'a', 'B3:row', 'b', 'B1:row']
  )
  const filtered = mergeTimeline(items, backups, { filter: 'chat', complete: true })
  assert.ok(filtered.filter((e) => e.kind === 'backup').every((e) => e.as === 'divider'))
  // More pages to come: Backup 1 (older than the oldest event loaded) waits for its page.
  const partial = mergeTimeline(items, backups, { filter: 'all', complete: false })
  assert.deepEqual(
    partial.map((e) => (e.kind === 'event' ? e.item.id : `B${e.backup.version}`)),
    ['B5', 'a', 'B3', 'b']
  )
  // Nothing under a Source, its backups still frame the time.
  assert.equal(mergeTimeline([], backups, { filter: 'chat', complete: true }).length, 3)
  assert.equal(nothingRecordedSince(all), true)
  assert.equal(
    nothingRecordedSince(
      mergeTimeline([ev('c', 6000), ...items], backups, { filter: 'all', complete: true })
    ),
    false
  )
})

const restoreEv = (id, sec, returnPoint) => ({
  ...ev(id, sec),
  description: {
    key: 'site-changes.restore-everything',
    params: { target: 'abc1234', version: 4, files: 2, returnPoint },
    isRequestOnly: false
  }
})

test('a Before-restore backup folds into its restore row by the host’s link, never by time (03/10)', () => {
  // The host makes Backup 5 first, the operation row was opened just before: by time alone the
  // backup would sit ABOVE the restore, reading as "backed up after restoring".
  const backups = backupsOf([
    rel(4, { database: full }),
    rel(5, { database: full, auto: 'pre-restore', title: 'Before restore to Backup 4', at: 5000 })
  ])
  const items = [ev('later', 6000), restoreEv('op-r', 4990, 5), ev('earlier', 4500)]
  const all = mergeTimeline(items, backups, { filter: 'all', complete: true })
  assert.deepEqual(
    all.map((e) => (e.kind === 'event' ? e.item.id : `B${e.backup.version}`)),
    ['later', 'op-r', 'earlier', 'B4']
  )
  const restore = all.find((e) => e.kind === 'event' && e.item.id === 'op-r')
  assert.equal(restore.returnPoint?.version, 5, 'the restore row carries its return point')
  // The Site changes filter holds the restore row too: still folded.
  const own = mergeTimeline([restoreEv('op-r', 4990, 5)], backups, { filter: 'site-changes', complete: true })
  assert.deepEqual(
    own.map((e) => (e.kind === 'event' ? e.item.id : `B${e.backup.version}`)),
    ['op-r', 'B4']
  )
  // Its restore row not in the list (another Source): the backup frames the time like any other.
  const chat = mergeTimeline([ev('earlier', 4500)], backups, { filter: 'chat', complete: true })
  assert.deepEqual(
    chat.map((e) => (e.kind === 'event' ? e.item.id : `B${e.backup.version}:${e.as}`)),
    ['B5:divider', 'earlier', 'B4:divider']
  )
  // A restore settled before the host's link was kept names no return point: nothing is guessed.
  const old = mergeTimeline([restoreEv('op-r', 4990, null)], backups, { filter: 'all', complete: true })
  assert.deepEqual(
    old.map((e) => (e.kind === 'event' ? e.item.id : `B${e.backup.version}`)),
    ['B5', 'op-r', 'B4']
  )
})

test('a backup counts every recorded change since the previous backup, not only files (03/10)', () => {
  const backups = backupsOf([rel(1), rel(3), rel(5)])
  const items = [ev('a', 4500), ev('b', 3500), ev('c', 2500), ev('d', 2000)]
  const counted = (list) =>
    Object.fromEntries(list.filter((e) => e.kind === 'backup').map((e) => [e.backup.version, e.changes]))
  assert.deepEqual(counted(mergeTimeline(items, backups, { filter: 'all', complete: true })), {
    5: 2,
    3: 2,
    1: null
  })
  // More pages to come and the previous backup older than every event loaded: not known yet.
  // (Backup 3 itself waits for its page.)
  assert.deepEqual(counted(mergeTimeline(items.slice(0, 2), backups, { filter: 'all', complete: false })), {
    5: null
  })
})

test('a restore of everything reads by the backup number, else by commit', () => {
  const item = (params) => ({
    description: { key: 'site-changes.restore-everything', params, isRequestOnly: false },
    request: { state: 'none' },
    effects: {}
  })
  assert.equal(
    describe(item({ target: 'abc1234', version: 4, files: 2 }), t).text,
    'Restored everything to Backup 4'
  )
  assert.equal(
    describe(item({ target: 'abc1234', version: null, files: 0 }), t).text,
    'Restored everything to commit abc1234'
  )
})

const change = (id, minutesSec, over = {}) => ({
  id,
  kind: 'turn',
  origin: { source: 'chat', evidence: 'confirmed' },
  actor: { type: 'person', id: 'tracy:mai@example.test', name: 'Mai Tran', role: 'requester' },
  description: {
    key: 'resource.op',
    params: { op: 'update', type: 'page', id: '12', title: 'About us' },
    isRequestOnly: false
  },
  occurredAt: new Date(minutesSec * 1000).toISOString(),
  detectedAt: null,
  timeBasis: 'occurred',
  effects: {
    content: { resources: [], operations: 0 },
    settings: { resources: [], operations: 0 },
    files: { count: null, sha: null, state: 'not-linked' },
    other: { operations: 0, actions: [] },
    coverage: { files: 'not-linked', content: 'recorded' }
  },
  request: {
    text: 'Please make the About us heading say Baked fresh since 1998 and warm up the hero colours a lot',
    state: 'full'
  },
  reversal: { state: 'none' },
  capabilities: { canDiff: false, canUndoFiles: false, reasons: [] },
  evidence: {},
  ...over
})

test('backup notes: the list’s own words, oldest first, no raw request, repeats counted, ten lines at most', () => {
  const restore = change('op', 3000, {
    kind: 'operation',
    origin: { source: 'site-changes', evidence: 'confirmed' },
    actor: { type: 'unknown', role: 'requester' },
    description: { key: 'site-changes.undo', params: { target: 'abc1234', files: 2 }, isRequestOnly: false },
    request: { state: 'none' }
  })
  const requestOnly = change('r', 1000, {
    description: { key: 'request', params: {}, isRequestOnly: true },
    request: {
      text: 'Make the footer warmer and also fix every link on the contact page so they open in a new tab please\nsecond line',
      state: 'full'
    }
  })
  const items = [restore, change('b', 2500), change('a', 2000), requestOnly]
  const draft = draftBackupNotes(items, t)
  assert.equal(
    draft,
    [
      `· Make the footer warmer and also fix every link on the contact page so they open…  — ${en['event.source.chat']}, Mai Tran`.replace(
        '…  —',
        '… —'
      ),
      `· Updated page “About us” — ${en['event.source.chat']}, Mai Tran ×2`,
      `· Undid changes to 2 files — ${en['event.source.site-changes']}`
    ].join('\n')
  )
  assert.doesNotMatch(draft, /Baked fresh since 1998/)
  // Past ten lines: the rest is counted.
  const many = Array.from({ length: 13 }, (_, i) =>
    change(`m${i}`, 5000 - i, {
      description: {
        key: 'resource.op',
        params: { op: 'update', type: 'page', id: String(i), title: null },
        isRequestOnly: false
      }
    })
  )
  const lines = draftBackupNotes(many, t).split('\n')
  assert.equal(lines.length, 11)
  assert.equal(lines[10], '…and 3 more changes')
})

test('backup notes: a request that mentioned an element reads the element’s words, never its markup', () => {
  const mention = change('r', 1000, {
    description: { key: 'request', params: {}, isRequestOnly: true },
    request: {
      text: 'thay ảnh này bằng ```tracy-element <mentioned-element url="http://site.test/" selector="#wp--skip-link--target &gt; div:nth-child(2)" status="resolved" incomplete="true" name="page &quot;Home&quot;"> text: Our bakery </mentioned-element> ```',
      state: 'full'
    }
  })
  assert.equal(
    draftBackupNotes([mention], t),
    `· thay ảnh này bằng "Our bakery" — ${en['event.source.chat']}, Mai Tran`
  )
})

test('changes since the newest backup: newer events only; all of them before any backup', () => {
  const items = [change('c', 3000), change('b', 2000), change('a', 1000)]
  assert.deepEqual(
    changesSince(items, { at: 1500 }).map((i) => i.id),
    ['c', 'b']
  )
  assert.equal(changesSince(items, null).length, 3)
})

test('restoreScopes: what Restore… may put back, and why a scope is missing (03/10)', () => {
  assert.deepEqual(restoreScopes({ capability: 'full' }), {
    everything: true,
    files: true,
    content: false,
    reason: null
  })
  assert.deepEqual(restoreScopes({ capability: 'files-only' }), {
    everything: false,
    files: true,
    content: false,
    reason: 'files-only'
  })
  assert.deepEqual(restoreScopes({ capability: 'db-missing' }), {
    everything: false,
    files: true,
    content: false,
    reason: 'db-missing'
  })
  const developer = { restoreFiles: true, restoreEverything: false }
  assert.deepEqual(restoreScopes({ capability: 'full' }, { may: developer }), {
    everything: false,
    files: true,
    content: false,
    reason: 'role-everything'
  })
  const editor = { restoreFiles: false, restoreEverything: false }
  assert.deepEqual(restoreScopes({ capability: 'full' }, { may: editor }), {
    everything: false,
    files: false,
    content: false,
    reason: null
  })
  assert.deepEqual(restoreScopes({ capability: 'content' }, { fileHistory: false }), {
    everything: false,
    files: false,
    content: true,
    reason: null
  })
})

// #1403 item 9: the door's two-minute wait ran out while the host went on, and the tab said "The
// backup could not be made. Nothing on the site was changed." — the person pressed again and the
// site got two backups. Only a refusal says nothing was made.
test('Create a backup: only a refusal is "failed"; a 202, a lost answer or an unreadable one may still end in a backup', () => {
  assert.equal(backupCreateOutcomeOf({ status: 200, code: '' }), 'made')
  assert.equal(backupCreateOutcomeOf({ status: 202, code: 'FLEET_JOB_PENDING' }), 'pending')
  assert.equal(backupCreateOutcomeOf(null), 'unconfirmed', 'the request itself failed')
  assert.equal(backupCreateOutcomeOf({ status: 502, code: 'FLEET_ANSWERED_UNREADABLY' }), 'unconfirmed')
  assert.equal(backupCreateOutcomeOf({ status: 504, code: 'FAILED' }), 'unconfirmed', "a proxy's page")
  assert.equal(backupCreateOutcomeOf({ status: 502, code: 'FAILED' }), 'unconfirmed')
  assert.equal(
    backupCreateOutcomeOf({ status: 502, code: 'FLEET_JOB_FAILED' }),
    'failed',
    "the host's own failure"
  )
  assert.equal(backupCreateOutcomeOf({ status: 400, code: 'INVALID_TITLE' }), 'failed')
  assert.equal(backupCreateOutcomeOf({ status: 403, code: 'FORBIDDEN_WRITE' }), 'failed')
  assert.equal(backupCreateOutcomeOf({ status: 429, code: 'RATE_LIMITED' }), 'rate-limited')
})

test('the newest backup among /backups rows: moments do not count, none is 0', () => {
  assert.equal(newestBackupVersion(null), 0)
  assert.equal(newestBackupVersion([]), 0)
  assert.equal(
    newestBackupVersion([
      { kind: 'moment', sha: 'a' },
      { kind: 'backup', version: 3 },
      { kind: 'backup', version: 7 },
      { kind: 'backup', version: 5 }
    ]),
    7
  )
})
