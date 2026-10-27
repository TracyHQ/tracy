#!/usr/bin/env node
/**
 * What the wizard does with one answer from the host half's `status` door.
 *
 * 🔒 `RUN_UNKNOWN` IS AN ANSWER, NOT A MISSED POLL. The run lives only in the memory of dsh
 * (`src/host/run.ts`), so a dsh restart — every push to `develop` redeploys it — forgets every
 * import that was going. Before this, any non-200 read as "ask again", and the wizard spun on
 * "Copying your content" forever: measured 2026-09-14 on cowork.tracy.site, fijitrips.example,
 * three hours of a spinner while the door had answered 404 RUN_UNKNOWN since the 03:22 UTC deploy.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pollVerdict } from '../src/client/import-poll.mjs'

test('a run in the answer is a run', () => {
  assert.equal(pollVerdict(200, { id: 'abc', state: 'running' }), 'run')
})

test('RUN_UNKNOWN means the host half forgot the run — stop asking', () => {
  assert.equal(pollVerdict(404, { code: 'RUN_UNKNOWN' }), 'lost')
})

test('a missed poll is asked again, not read as bad news', () => {
  assert.equal(pollVerdict(0, { code: 'NETWORK' }), 'retry')
  assert.equal(pollVerdict(502, {}), 'retry')
  assert.equal(pollVerdict(500, { code: 'INTERNAL_ERROR' }), 'retry')
})

test('a 404 without the code is a road problem (a proxy page), not a forgotten run', () => {
  assert.equal(pollVerdict(404, {}), 'retry')
  assert.equal(pollVerdict(404, { code: 'UNKNOWN_STEP' }), 'retry')
})

test('a 200 without an id is not a run', () => {
  assert.equal(pollVerdict(200, {}), 'retry')
})
