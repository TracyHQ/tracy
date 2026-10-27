/**
 * Attaching to a source run that is already up (`test/e2e/attach.mjs`): the decision whether the
 * `runtime.json` of a `pnpm debug` run may be driven — it must name a live pid, the origin the agent
 * asked for, and a loopback debug port held by that pid. Anything else refuses with the reason.
 *
 *   node --test packages/desktop/tracy-desktop/test/attach.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { attachDecision } from './e2e/attach.mjs'

const RECORD = {
  pid: 4242,
  sha: 'a'.repeat(40),
  origin: 'http://tracy.test:8080',
  profile: '/x/profile',
  cdp: 'http://127.0.0.1:53111',
  inspect: 'ws://127.0.0.1:53112/abc'
}

const decide = (over = {}) =>
  attachDecision({
    file: '/x/profile/runtime.json',
    record: RECORD,
    origin: 'http://tracy.test:8080',
    alive: (pid) => pid === 4242,
    portOwner: (port) => (port === 53111 ? 4242 : null),
    ...over
  })

test('a live run of the asked origin, with its own loopback debug port, may be attached', () => {
  assert.deepEqual(decide(), {
    ok: true,
    pid: 4242,
    cdp: 'http://127.0.0.1:53111',
    origin: 'http://tracy.test:8080'
  })
  // A trailing slash on the asked origin is the same origin.
  assert.equal(decide({ origin: 'http://tracy.test:8080/' }).ok, true)
})

test('each reason to refuse is named', () => {
  for (const [over, why] of [
    [{ record: null }, /no runtime\.json at \/x\/profile\/runtime\.json.*pnpm debug/],
    [{ record: { parseError: 'Unexpected token' } }, /not JSON/],
    [{ record: { ...RECORD, pid: 'x' } }, /no pid/],
    [{ alive: () => false }, /pid 4242 is not running/],
    [
      { origin: 'https://cowork.tracy.site' },
      /runs http:\/\/tracy\.test:8080, not https:\/\/cowork\.tracy\.site/
    ],
    [{ record: { ...RECORD, cdp: null } }, /without a debug port.*pnpm debug/],
    [{ record: { ...RECORD, cdp: 'http://0.0.0.0:53111' } }, /loopback/],
    [{ portOwner: () => 999 }, /port 53111 is held by pid 999, not 4242/],
    [{ portOwner: () => null }, /nothing listens on port 53111/]
  ]) {
    const decision = decide(over)
    assert.equal(decision.ok, false, JSON.stringify(over))
    assert.match(decision.reason, why)
  }
})
