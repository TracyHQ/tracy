/**
 * Which deploys cut a running chat turn of a conversation — read from the file `deploy-host-dsh.sh`
 * writes when its drain runs out (#1403 item 11). The turn card used to blame "a Tracy update" for
 * every interruption, a crash or a host reboot included.
 *
 *   node --test packages/tools/tracy-site-tools/test/cut-by-deploy.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { CUT_FILE, CUT_MAX_BYTES, cutTimes } from '../src/host/cut-by-deploy.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cut-by-deploy-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const S = 'session-0a1b2c'
// The shape the deploy script appends (`record_cut`): each cut lease as its own JSON.
const lease = (kind, sessionId, siteKey) => ({
  id: `${kind}-${sessionId}`,
  kind,
  siteKey,
  sessionId,
  heartbeatAt: '2026-10-16T09:00:00.000Z'
})
const write = (records) => writeFileSync(path.join(dir, CUT_FILE), JSON.stringify(records))

test('the deploys that cut a chat turn of the conversation, oldest first, in the site the page stands in', () => {
  write([
    {
      at: '2026-10-16T10:05:00Z',
      tag: 'b',
      work: [lease('chat', S, 'qaem643'), lease('import', 'x', 'qaem643')]
    },
    { at: '2026-10-15T08:00:00Z', tag: 'a', work: [lease('chat', S, 'qaem643')] },
    { at: '2026-10-16T11:00:00Z', tag: 'c', work: [lease('chat', 'session-other', 'qaem643')] },
    { at: '2026-10-16T12:00:00Z', tag: 'd', work: [lease('import', S, 'qaem643')] }
  ])
  assert.deepEqual(cutTimes(S, 'qaem643', { dir }), [
    Date.parse('2026-10-15T08:00:00Z'),
    Date.parse('2026-10-16T10:05:00Z')
  ])
  assert.deepEqual(
    cutTimes(S, undefined, { dir }).length,
    2,
    'a page talking to dsh directly is not fenced by site'
  )
  assert.deepEqual(cutTimes(S, 'another-site', { dir }), [], "another site's page learns nothing")
  assert.deepEqual(cutTimes(S, null, { dir }), [], 'a mount that names no site matches none')
})

test('no file, a broken one, another shape or an oversized one names no deploy', () => {
  assert.deepEqual(cutTimes(S, 'qaem643', { dir }), [])
  writeFileSync(path.join(dir, CUT_FILE), '[{"at":')
  assert.deepEqual(cutTimes(S, 'qaem643', { dir }), [])
  writeFileSync(path.join(dir, CUT_FILE), JSON.stringify({ at: '2026-10-16T10:05:00Z' }))
  assert.deepEqual(cutTimes(S, 'qaem643', { dir }), [])
  write([
    { at: 'not a time', work: [lease('chat', S, 'qaem643')] },
    { at: '2026-10-16T10:05:00Z', work: 'x' }
  ])
  assert.deepEqual(cutTimes(S, 'qaem643', { dir }), [])
  writeFileSync(path.join(dir, CUT_FILE), ' '.repeat(CUT_MAX_BYTES + 1))
  assert.deepEqual(cutTimes(S, 'qaem643', { dir }), [])
})
