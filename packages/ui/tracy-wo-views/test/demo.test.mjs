#!/usr/bin/env node
/**
 * The Demo column's two lines (`src/demo.ts`, tasks/todo-wo-demo-retention.md, "Demo column"): what a
 * demo's state and countdown say, decided once for the table, the grid cards and /ops.
 *
 *   node --test packages/ui/tracy-wo-views/test/demo.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoView } from '../src/demo.ts'

const NOW = Date.parse('2026-10-19T12:00:00Z')
const H = 3_600_000
const D = 24 * H
const iso = (ms) => new Date(ms).toISOString()
const live = (left, over = {}) => ({
  siteKey: 'phoba.tracy.site',
  url: 'https://phoba.tracy.site',
  expiresAt: iso(NOW + left),
  frozenAt: null,
  deletedAt: null,
  deletesAt: null,
  qa: null,
  build: { status: 'done', startedAt: iso(NOW - 20 * D) },
  ...over
})

test('no demo: a dash', () => {
  assert.deepEqual(demoView(null, NOW), { kind: 'none' })
})

test('more than 3 days left: calm, whole days rounded up, QA passed said beside it', () => {
  assert.deepEqual(demoView(live(12 * D + 5 * H, { qa: 'passed' }), NOW), {
    kind: 'live',
    level: 'calm',
    unit: 'day',
    left: 13,
    qaPassed: true,
    extend: false
  })
})

test('a demo just built with a 14-day term says 14 days left, not 13 (stand wo2 4b)', () => {
  assert.equal(demoView(live(14 * D - 30_000), NOW).left, 14)
})

test('3 days or less: soon, with Extend; under 24 hours: urgent, in hours', () => {
  assert.deepEqual(demoView(live(3 * D), NOW), {
    kind: 'live',
    level: 'soon',
    unit: 'day',
    left: 3,
    qaPassed: false,
    extend: true
  })
  assert.deepEqual(demoView(live(2 * D + 23 * H), NOW).left, 3)
  assert.deepEqual(demoView(live(18 * H - 1000), NOW), {
    kind: 'live',
    level: 'urgent',
    unit: 'hour',
    left: 18,
    qaPassed: false,
    extend: true
  })
  assert.equal(demoView(live(10 * 60_000), NOW).left, 1, 'under an hour is still 1 hour, never 0')
})

test('kept for good: the site, no countdown', () => {
  assert.deepEqual(demoView(live(0, { expiresAt: null }), NOW), { kind: 'kept' })
})

test('frozen: the days until it is deleted, never below 0', () => {
  const frozen = live(-D, { frozenAt: iso(NOW - D), deletesAt: iso(NOW + 6 * D - H) })
  assert.deepEqual(demoView(frozen, NOW), { kind: 'frozen', deletesInDays: 6 })
  assert.deepEqual(demoView({ ...frozen, deletesAt: iso(NOW - H) }, NOW), {
    kind: 'frozen',
    deletesInDays: 0
  })
  assert.deepEqual(demoView({ ...frozen, deletesAt: null }, NOW), { kind: 'frozen', deletesInDays: null })
})

test('deleted: when, and Rebuild', () => {
  const deleted = live(-9 * D, { frozenAt: iso(NOW - 8 * D), deletedAt: iso(NOW - D) })
  assert.deepEqual(demoView(deleted, NOW), { kind: 'deleted', at: iso(NOW - D) })
})

test('building: minutes since it started; failed: Retry', () => {
  const building = live(14 * D, {
    siteKey: null,
    expiresAt: null,
    build: { status: 'building', startedAt: iso(NOW - 4 * 60_000 - 5000) }
  })
  assert.deepEqual(demoView(building, NOW), { kind: 'building', minutes: 4 })
  assert.deepEqual(demoView({ ...building, build: { status: 'failed', startedAt: iso(NOW - H) } }, NOW), {
    kind: 'failed'
  })
})
