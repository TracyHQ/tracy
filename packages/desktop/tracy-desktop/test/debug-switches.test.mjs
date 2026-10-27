/**
 * A PACKAGED app refuses Chromium's remote-debugging switches (`src/debug-switches.js`): with one, any
 * local process could start the signed app with a debug port and drive it with the person's session.
 * Source runs keep them — `pnpm debug` relies on `--remote-debugging-port=0`.
 *
 *   node --test packages/desktop/tracy-desktop/test/debug-switches.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

import { debugGuardFirst } from '../build/release-preflight.mjs'

const require = createRequire(import.meta.url)
const { debugSwitchVerdict, refusedDebugSwitch } = require('../src/debug-switches.js')

const EXE = '/Applications/Tracy Cowork Dev.app/Contents/MacOS/Tracy Cowork Dev'
const none = () => false

test('a packaged app refuses every remote-debugging switch, in every spelling', () => {
  for (const [argv, name] of [
    [[EXE, '--remote-debugging-port=0'], 'remote-debugging-port'],
    [[EXE, '--remote-debugging-port', '9555'], 'remote-debugging-port'],
    [[EXE, '--remote-debugging-pipe'], 'remote-debugging-pipe'],
    [[EXE, '--remote-debugging-address=127.0.0.1'], 'remote-debugging-address'],
    [[EXE, '-remote-debugging-port=9555'], 'remote-debugging-port'],
    [[EXE, '--REMOTE-DEBUGGING-PORT=9555'], 'remote-debugging-port'],
    [[EXE, '--remote_debugging_port=9555'], 'remote-debugging-port']
  ])
    assert.equal(refusedDebugSwitch({ packaged: true, argv, hasSwitch: none }), name, argv.join(' '))
})

test('a switch Chromium knows about but argv does not show is refused too', () => {
  const hasSwitch = (s) => s === 'remote-debugging-pipe'
  assert.equal(refusedDebugSwitch({ packaged: true, argv: [EXE], hasSwitch }), 'remote-debugging-pipe')
})

test('a source run keeps them, and a packaged app with none starts', () => {
  assert.equal(
    refusedDebugSwitch({ packaged: false, argv: [EXE, '--remote-debugging-port=0'], hasSwitch: () => true }),
    null
  )
  assert.equal(
    refusedDebugSwitch({ packaged: true, argv: [EXE, '--some-flag', 'https://x'], hasSwitch: none }),
    null
  )
  // A word that only contains the name is not the switch.
  assert.equal(
    refusedDebugSwitch({ packaged: true, argv: [EXE, 'notes-remote-debugging-port.txt'], hasSwitch: none }),
    null
  )
})

test('TRACY_DESKTOP_ALLOW_CDP=1 lets a dev or test build take a debug port (media capture); a stable build never', () => {
  const port = { packaged: true, argv: [EXE, '--remote-debugging-port=9317'], hasSwitch: none }
  const allow = { TRACY_DESKTOP_ALLOW_CDP: '1' }
  // A dev build, and a test or Preview build with no update channel at all: allowed, and said so.
  for (const channel of ['dev', undefined]) {
    const verdict = debugSwitchVerdict({ ...port, channel, env: allow })
    assert.equal(verdict.refused, null, String(channel))
    assert.match(verdict.note, /TRACY_DESKTOP_ALLOW_CDP=1.*remote debugging allowed/)
  }
  // The stable channel ignores it and refuses as before, saying why.
  const stable = debugSwitchVerdict({ ...port, channel: 'stable', env: allow })
  assert.equal(stable.refused, 'remote-debugging-port')
  assert.match(stable.note, /TRACY_DESKTOP_ALLOW_CDP ignored on the stable channel/)
  // Unset, or any other value: no change anywhere.
  for (const env of [{}, { TRACY_DESKTOP_ALLOW_CDP: 'true' }, { TRACY_DESKTOP_ALLOW_CDP: '0' }])
    assert.deepEqual(debugSwitchVerdict({ ...port, channel: 'dev', env }), {
      refused: 'remote-debugging-port',
      note: null
    })
  // A launch without a debug switch is untouched either way.
  assert.deepEqual(
    debugSwitchVerdict({ packaged: true, argv: [EXE], hasSwitch: none, channel: 'stable', env: allow }),
    { refused: null, note: null }
  )
})

test('main.js refuses the switches before anything else runs — before app.whenReady', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.equal(debugGuardFirst(main), true)
  // The same reader publish uses refuses a main.js whose guard comes late, or is gone.
  const late = main.replace(/^require\('\.\/debug-switches\.js'\)\.refuseDebugSwitches\(app\)\n/m, '')
  assert.notEqual(late, main)
  assert.equal(debugGuardFirst(late), false)
  assert.equal(debugGuardFirst(`${late}\nrequire('./debug-switches.js').refuseDebugSwitches(app)\n`), false)
})

test('TRACY_DESKTOP_ONBOARDING=again shows the first-run screen again, in a run from source only', () => {
  const { onboardingAgain } = require('../src/debug-switches.js')
  assert.equal(onboardingAgain({ packaged: false, env: { TRACY_DESKTOP_ONBOARDING: 'again' } }), true)
  assert.equal(onboardingAgain({ packaged: true, env: { TRACY_DESKTOP_ONBOARDING: 'again' } }), false)
  assert.equal(onboardingAgain({ packaged: false, env: { TRACY_DESKTOP_ONBOARDING: '1' } }), false)
  assert.equal(onboardingAgain({ packaged: false, env: {} }), false)
})

test('the self-update test switches: a shortened interval and a heartbeat, never on the stable channel', () => {
  const { updateTestSwitches } = require('../src/debug-switches.js')
  const on = { TRACY_DESKTOP_UPDATE_INTERVAL_MS: '120000', TRACY_DESKTOP_UPDATE_HEARTBEAT: '1' }
  assert.deepEqual(updateTestSwitches({ channel: 'dev', env: on }), {
    intervalMs: 120_000,
    heartbeatMs: 60_000,
    remindMs: null,
    notifyLog: null,
    blockedPress: null,
    ignored: []
  })
  // Unset: nothing changes, nothing is said.
  assert.deepEqual(updateTestSwitches({ channel: 'dev', env: {} }), {
    intervalMs: null,
    heartbeatMs: null,
    remindMs: null,
    notifyLog: null,
    blockedPress: null,
    ignored: []
  })
  // A stable copy keeps its schedule whatever its environment holds, and the log says why.
  const stable = updateTestSwitches({ channel: 'stable', env: on })
  assert.equal(stable.intervalMs, null)
  assert.equal(stable.heartbeatMs, null)
  assert.equal(stable.ignored.length, 2)
  // Below a minute, above four hours, or not a number: ignored and said so.
  for (const value of ['59999', '14400001', '2m', '', '-120000', '1e5']) {
    const r = updateTestSwitches({ channel: 'dev', env: { TRACY_DESKTOP_UPDATE_INTERVAL_MS: value } })
    assert.equal(r.intervalMs, null, value)
    assert.equal(r.ignored.length, 1, value)
  }
  const r = updateTestSwitches({ channel: 'dev', env: { TRACY_DESKTOP_UPDATE_HEARTBEAT: 'yes' } })
  assert.equal(r.heartbeatMs, null)
  assert.equal(r.ignored.length, 1)
})

test('the heartbeat logs one line per beat with how late it ran, and stops', () => {
  const { createHeartbeat } = require('../src/debug-switches.js')
  const pending = []
  const timers = {
    setTimeout: (fn, ms) => {
      const t = { fn, ms }
      pending.push(t)
      return t
    },
    clearTimeout: (t) => pending.splice(pending.indexOf(t), 1)
  }
  const clock = { now: 1_000 }
  const logs = []
  const stop = createHeartbeat({
    everyMs: 60_000,
    timers,
    now: () => clock.now,
    log: (l) => logs.push(l),
    pid: 42
  })
  assert.equal(pending.length, 1)
  assert.equal(pending[0].ms, 60_000)
  // On time.
  clock.now = 61_000
  pending.shift().fn()
  // Held back nine minutes (a modal loop, a suspend): the next beat says so.
  clock.now = 61_000 + 60_000 + 540_000
  pending.shift().fn()
  assert.deepEqual(logs, ['heartbeat 1: pid 42, 0 ms late', 'heartbeat 2: pid 42, 540000 ms late'])
  stop()
  assert.equal(pending.length, 0)
})

test('TRACY_DESKTOP_UPDATE_REMIND_MS shortens the restart reminder waits on a test build, from a minute to three days', () => {
  const { updateTestSwitches } = require('../src/debug-switches.js')
  assert.equal(
    updateTestSwitches({ channel: 'dev', env: { TRACY_DESKTOP_UPDATE_REMIND_MS: '60000' } }).remindMs,
    60_000
  )
  for (const value of ['59999', '259200001', 'soon']) {
    const r = updateTestSwitches({ channel: 'dev', env: { TRACY_DESKTOP_UPDATE_REMIND_MS: value } })
    assert.equal(r.remindMs, null, value)
    assert.equal(r.ignored.length, 1, value)
  }
  const stable = updateTestSwitches({ channel: 'stable', env: { TRACY_DESKTOP_UPDATE_REMIND_MS: '60000' } })
  assert.equal(stable.remindMs, null)
  assert.equal(stable.ignored.length, 1)
})

test('TRACY_DESKTOP_NOTIFY_LOG records the shell’s notifications (and presses them) on a test build only', () => {
  const { updateTestSwitches } = require('../src/debug-switches.js')
  assert.equal(
    updateTestSwitches({ channel: 'dev', env: { TRACY_DESKTOP_NOTIFY_LOG: '/tmp/x/notify.jsonl' } })
      .notifyLog,
    '/tmp/x/notify.jsonl'
  )
  const relative = updateTestSwitches({ channel: 'dev', env: { TRACY_DESKTOP_NOTIFY_LOG: 'notify.jsonl' } })
  assert.equal(relative.notifyLog, null)
  assert.equal(relative.ignored.length, 1)
  const stable = updateTestSwitches({ channel: 'stable', env: { TRACY_DESKTOP_NOTIFY_LOG: '/tmp/x' } })
  assert.equal(stable.notifyLog, null)
  assert.equal(stable.ignored.length, 1)
})

test('TRACY_DESKTOP_TEST_BLOCKED_PRESS lists the blocked screen’s buttons a test run presses, in order — test builds only', () => {
  const { updateTestSwitches } = require('../src/debug-switches.js')
  assert.deepEqual(
    updateTestSwitches({ channel: 'dev', env: { TRACY_DESKTOP_TEST_BLOCKED_PRESS: 'update,retry,download' } })
      .blockedPress,
    ['update', 'retry', 'download']
  )
  const bad = updateTestSwitches({
    channel: 'dev',
    env: { TRACY_DESKTOP_TEST_BLOCKED_PRESS: 'update,install' }
  })
  assert.equal(bad.blockedPress, null)
  assert.equal(bad.ignored.length, 1)
  const stable = updateTestSwitches({
    channel: 'stable',
    env: { TRACY_DESKTOP_TEST_BLOCKED_PRESS: 'update' }
  })
  assert.equal(stable.blockedPress, null)
  assert.equal(stable.ignored.length, 1)
})
