#!/usr/bin/env node
/**
 * Download… on a backup — `src/site-tabs/backup-download.ts` (plan todo-backup-export, S4).
 *
 *   node --test packages/core/tracy-core/test/backup-download.test.mjs
 *
 * Quiet failures guarded here: the item offered to a seat the door refuses (an editor) or on a point
 * the host cannot pack (no verified database, EmDash), a door refusal shown as a generic failure, and
 * a poll that never stops.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { downloadable, downloadRefusalKey, megabytes, settled } from '../src/site-tabs/backup-download.ts'

const point = (capability, applicationAvailable) => ({ version: 3, capability, applicationAvailable })

test('downloadable: packable backups only, and only when the server said this seat may export', () => {
  const owner = { restoreFiles: true, restoreEverything: true, export: true }
  assert.equal(downloadable(point('full'), owner), true)
  assert.equal(downloadable(point('content', true), owner), true, 'EmDash has an app snapshot')
  assert.equal(downloadable(point('content', false), owner), false, 'the app snapshot is absent')
  assert.equal(downloadable(point('content'), owner), false, 'an older host did not report a snapshot')
  for (const capability of ['files-only', 'db-missing'])
    assert.equal(downloadable(point(capability), owner), false, capability)
  assert.equal(downloadable(point('full'), { ...owner, export: false }), false, 'an editor')
  assert.equal(
    downloadable(point('full'), { restoreFiles: true, restoreEverything: true }),
    false,
    'an older server'
  )
  assert.equal(downloadable(point('full'), null), false, 'nothing said: not offered')
})

test('downloadRefusalKey: each refusal of the door in its own words', () => {
  assert.equal(downloadRefusalKey(409, 'EXPORT_IN_PROGRESS'), 'backup.download.err.busy')
  assert.equal(downloadRefusalKey(429, 'EXPORT_LIMIT_IN_FLIGHT'), 'backup.download.err.limit')
  assert.equal(downloadRefusalKey(429, 'EXPORT_RATE_LIMITED'), 'backup.download.err.limit')
  assert.equal(downloadRefusalKey(403, 'FORBIDDEN_EXPORT'), 'backup.download.err.forbidden')
  assert.equal(downloadRefusalKey(502, 'FAILED'), 'backup.download.err.failed')
})

test('settled: the poll stops on ready, failed and expired only', () => {
  for (const s of ['queued', 'packing', 'uploading']) assert.equal(settled(s), false, s)
  for (const s of ['ready', 'failed', 'expired']) assert.equal(settled(s), true, s)
})

test('megabytes: one decimal, never zero for a package that exists', () => {
  assert.equal(megabytes(52_428_800), 50)
  assert.equal(megabytes(1_572_864), 1.5)
  assert.equal(megabytes(1000), 0.1)
})
