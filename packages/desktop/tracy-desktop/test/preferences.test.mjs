/**
 * The app's own preferences file (`src/preferences.js`, `<userData>/preferences.json`): the switch
 * "Check for updates automatically", the first-run screen's state and the system-notification switch.
 * Read defensively (a bad part falls back to its default alone), written whole and atomically, one
 * write at a time.
 *
 *   node --test packages/desktop/tracy-desktop/test/preferences.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createPreferences } = require('../src/preferences.js')

const ONBOARDING = { flowVersion: 1, closedAt: null, outcome: null, picked: null }
const DEFAULTS = {
  autoCheck: true,
  onboarding: ONBOARDING,
  notifications: { enabled: true, sound: 'system' },
  whatsNew: { pending: null, lastRunVersion: null, notify: true }
}
const doc = (autoCheck) => ({ ...DEFAULTS, autoCheck })

function setup(content) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-prefs-'))
  const file = path.join(dir, 'preferences.json')
  if (content !== undefined) writeFileSync(file, content)
  const logs = []
  return { dir, file, logs, prefs: createPreferences({ file, log: (line) => logs.push(line) }) }
}

test('no file yet: automatic checks are on', () => {
  assert.deepEqual(setup().prefs.read(), DEFAULTS)
})

test('a saved choice is read back', () => {
  assert.deepEqual(setup('{"autoCheck":false}').prefs.read(), doc(false))
})

test('a broken file falls back to on, and says so in the log', () => {
  const { prefs, logs } = setup('{not json')
  assert.deepEqual(prefs.read(), DEFAULTS)
  assert.match(logs.join('\n'), /preferences/)
})

test('a value of the wrong type is not trusted', () => {
  assert.deepEqual(setup('{"autoCheck":"no"}').prefs.read(), DEFAULTS)
  assert.deepEqual(setup('[false]').prefs.read(), DEFAULTS)
})

test('an oversized file is not parsed', () => {
  const { prefs, logs } = setup(`{"autoCheck":false,"pad":"${'x'.repeat(70_000)}"}`)
  assert.deepEqual(prefs.read(), DEFAULTS)
  assert.match(logs.join('\n'), /too large/)
})

test('a write lands whole, through a temporary file, and leaves no temporary file behind', async () => {
  const { dir, file, prefs } = setup()
  await prefs.write({ autoCheck: false })
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { autoCheck: false })
  assert.deepEqual(readdirSync(dir), ['preferences.json'])
  assert.deepEqual(prefs.read(), doc(false))
})

test('writes run one at a time, in the order asked: the last one wins', async () => {
  const { file, prefs } = setup()
  await Promise.all([
    prefs.write({ autoCheck: false }),
    prefs.write({ autoCheck: true }),
    prefs.write({ autoCheck: false })
  ])
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { autoCheck: false })
})

test('a write that cannot land rejects, so the caller does not pretend it saved', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-prefs-'))
  // The file's place is a directory: rename onto it fails.
  const file = path.join(dir, 'preferences.json')
  mkdirSync(file)
  writeFileSync(path.join(file, 'keep'), '')
  const prefs = createPreferences({ file, log: () => {} })
  await assert.rejects(prefs.write({ autoCheck: false }))
  assert.ok(existsSync(path.join(file, 'keep')))
  // The queue is not stuck after a failure.
  await assert.rejects(prefs.write({ autoCheck: true }))
})

test('only known keys of the right type are written', async () => {
  const { file, prefs } = setup()
  await prefs.write({ autoCheck: false, feed: 'https://evil.example' })
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { autoCheck: false })
  await assert.rejects(prefs.write({ autoCheck: 'yes' }), /autoCheck/)
})

test('the first-run state and the notification switch are read back', () => {
  const saved = {
    autoCheck: false,
    onboarding: { flowVersion: 1, closedAt: 1_791_600_000_000, outcome: 'completed', picked: 'claude' },
    notifications: { enabled: false, sound: 'system' }
  }
  assert.deepEqual(setup(JSON.stringify(saved)).prefs.read(), { ...saved, whatsNew: DEFAULTS.whatsNew })
})

test('a bad part falls back to its own default and leaves the other parts alone', () => {
  const bad = [
    { closedAt: 'yesterday', outcome: 'completed', picked: null, flowVersion: 1 },
    { closedAt: 5, outcome: 'maybe', picked: null, flowVersion: 1 },
    { closedAt: 5, outcome: 'dismissed', picked: '../x', flowVersion: 1 },
    { closedAt: 5, outcome: 'dismissed', picked: null, flowVersion: 2 },
    { closedAt: -1, outcome: 'dismissed', picked: null, flowVersion: 1 },
    'closed',
    null
  ]
  for (const onboarding of bad) {
    const text = JSON.stringify({
      autoCheck: false,
      onboarding,
      notifications: { enabled: false, sound: 'system' }
    })
    assert.deepEqual(
      setup(text).prefs.read(),
      {
        autoCheck: false,
        onboarding: ONBOARDING,
        notifications: { enabled: false, sound: 'system' },
        whatsNew: DEFAULTS.whatsNew
      },
      JSON.stringify(onboarding)
    )
  }
  assert.deepEqual(setup('{"autoCheck":false,"notifications":{"enabled":"no"}}').prefs.read(), {
    autoCheck: false,
    onboarding: ONBOARDING,
    notifications: { enabled: true, sound: 'system' },
    whatsNew: DEFAULTS.whatsNew
  })
})

test('update changes one part, keeps the others, and returns the document it saved', async () => {
  const { file, prefs } = setup('{"autoCheck":false}')
  const closed = { flowVersion: 1, closedAt: 42, outcome: 'dismissed', picked: null }
  assert.deepEqual(await prefs.update({ onboarding: closed }), { ...doc(false), onboarding: closed })
  await prefs.update({ notifications: { enabled: false, sound: 'system' } })
  await prefs.update({ autoCheck: true })
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {
    autoCheck: true,
    onboarding: closed,
    notifications: { enabled: false, sound: 'system' },
    whatsNew: DEFAULTS.whatsNew
  })
})

test('updates run in the order asked, each on top of the one before', async () => {
  const { prefs } = setup()
  const closed = { flowVersion: 1, closedAt: 1, outcome: 'completed', picked: 'codex' }
  await Promise.all([
    prefs.update({ autoCheck: false }),
    prefs.update({ onboarding: closed }),
    prefs.update({ notifications: { enabled: false, sound: 'system' } })
  ])
  assert.deepEqual(prefs.read(), {
    autoCheck: false,
    onboarding: closed,
    notifications: { enabled: false, sound: 'system' },
    whatsNew: DEFAULTS.whatsNew
  })
})

test('an update with a bad value rejects and saves nothing', async () => {
  const { prefs } = setup('{"autoCheck":false}')
  for (const patch of [
    { autoCheck: 'yes' },
    { notifications: { enabled: 1 } },
    { onboarding: { flowVersion: 1, closedAt: 1, outcome: 'won', picked: null } },
    { onboarding: { flowVersion: 1, closedAt: 1, outcome: 'completed', picked: 'Claude Code' } },
    { onboarding: { flowVersion: 1, closedAt: 1, outcome: 'completed' } },
    null
  ])
    await assert.rejects(prefs.update(patch), TypeError, JSON.stringify(patch))
  assert.deepEqual(prefs.read(), doc(false))
})

test('a whole-document write keeps only known parts, each checked', async () => {
  const { file, prefs } = setup()
  await prefs.write({ autoCheck: true, notifications: { enabled: false, sound: 'Pop', volume: 3 }, extra: 1 })
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {
    autoCheck: true,
    notifications: { enabled: false, sound: 'Pop' }
  })
  await assert.rejects(prefs.write({ autoCheck: true, onboarding: { closedAt: 'x' } }), /onboarding/)
})

test('the notification sound is the system default, or one of the macOS alert sounds; anything else is the default', () => {
  const read = (sound) =>
    setup(JSON.stringify({ autoCheck: true, notifications: { enabled: false, sound } })).prefs.read()
      .notifications
  assert.deepEqual(read('Glass'), { enabled: false, sound: 'Glass' })
  assert.deepEqual(read('system'), { enabled: false, sound: 'system' })
  for (const bad of ['glass', '../../evil', 'Funk.aiff', '', 7, null])
    assert.deepEqual(read(bad), { enabled: false, sound: 'system' }, JSON.stringify(bad))
  // A file from before the sound existed keeps its switch.
  assert.deepEqual(setup('{"autoCheck":true,"notifications":{"enabled":false}}').prefs.read().notifications, {
    enabled: false,
    sound: 'system'
  })
})

test('a sound is saved only when it is one of the list', async () => {
  const { prefs } = setup()
  await prefs.update({ notifications: { enabled: true, sound: 'Submarine' } })
  assert.equal(prefs.read().notifications.sound, 'Submarine')
  await assert.rejects(prefs.update({ notifications: { enabled: true, sound: 'Beep' } }), TypeError)
  assert.equal(prefs.read().notifications.sound, 'Submarine')
})

test('the switch and the sound can be changed one at a time, together, and neither change is lost', async () => {
  const { prefs } = setup()
  await Promise.all([
    prefs.update({ notifications: { enabled: false } }),
    prefs.update({ notifications: { sound: 'Pop' } })
  ])
  assert.deepEqual(prefs.read().notifications, { enabled: false, sound: 'Pop' })
  await assert.rejects(prefs.update({ notifications: { sound: 'Beep' } }), TypeError)
})

// ── What's new (tasks/todo-desktop-update-policy.md D3) ──────────────────────────────────────────

test("what's new: pending, the last run's version and the notify switch are read back", () => {
  const whatsNew = {
    pending: { from: '0.5.1', to: '0.6.0', page: '0.6' },
    lastRunVersion: '0.6.0',
    notify: false
  }
  assert.deepEqual(setup(JSON.stringify({ autoCheck: true, whatsNew })).prefs.read().whatsNew, whatsNew)
})

test("what's new: a malformed part falls back to its default, the rest stays", () => {
  for (const whatsNew of [
    { pending: { to: 7 }, lastRunVersion: '0.6.0', notify: true },
    { pending: null, lastRunVersion: 5, notify: true },
    { pending: null, lastRunVersion: null, notify: 'yes' },
    'none'
  ]) {
    const read = setup(JSON.stringify({ autoCheck: false, whatsNew })).prefs.read()
    assert.deepEqual(read.whatsNew, DEFAULTS.whatsNew, JSON.stringify(whatsNew))
    assert.equal(read.autoCheck, false)
  }
})

test("what's new: its fields change one at a time, in one write, and neither loses the other", async () => {
  const { prefs } = setup()
  await Promise.all([
    prefs.update({
      whatsNew: { pending: { from: null, to: '0.6.0', page: '0.6' }, lastRunVersion: '0.6.0' }
    }),
    prefs.update({ whatsNew: { notify: false } })
  ])
  assert.deepEqual(prefs.read().whatsNew, {
    pending: { from: null, to: '0.6.0', page: '0.6' },
    lastRunVersion: '0.6.0',
    notify: false
  })
  await assert.rejects(prefs.update({ whatsNew: { notify: 'off' } }))
})
