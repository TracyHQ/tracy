/**
 * The Electron half of the self-update (`src/updater.js`), driven through its one entry point with a
 * stand-in for electron-updater's `autoUpdater`, the clock and the dialogs: what it configures, when
 * it checks, what it asks the person, and that only "Restart" installs.
 *
 *   node --test packages/desktop/tracy-desktop/test/updater.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

/** A temp folder removed when the test ends, pass or fail. */
function tempDir(t, prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const require = createRequire(import.meta.url)
const { startUpdater, readInstallId } = require('../src/updater.js')

const MINUTE = 60 * 1000

/** Stands for src/signed-feed-provider.js's class: what the updater must read the feed through. */
class SignedProvider {}

/** A stand-in for electron-updater's autoUpdater: records calls, lets a test decide each check. */
function fakeUpdater() {
  const u = new EventEmitter()
  u.requestHeaders = null
  u.checks = 0
  u.downloads = 0
  u.installs = []
  u.next = []
  u.checkForUpdates = async () => {
    u.checks++
    u.emit('checking-for-update')
    if (u.gate) await u.gate
    const outcome = u.next.shift() ?? { available: false }
    if (outcome.error) throw new Error(outcome.error)
    if (outcome.available) {
      u.emit('update-available', {
        version: outcome.version,
        files: outcome.files,
        releaseNotes: outcome.notes
      })
      return { isUpdateAvailable: true, updateInfo: { version: outcome.version } }
    }
    u.emit('update-not-available', {})
    return { isUpdateAvailable: false, updateInfo: { version: '0.2.0' } }
  }
  u.feedConfig = null
  u.setFeedURL = (config) => {
    u.feedConfig = config
  }
  u.downloadUpdate = async () => {
    u.downloads++
  }
  u.quitAndInstall = (...args) => {
    u.installs.push(args)
    if (u.installThrows) throw new Error(u.installThrows)
  }
  return u
}

/** A clock whose timers run only when the test says so. */
function fakeTimers() {
  const pending = []
  return {
    pending,
    setTimeout: (fn, ms) => {
      const t = { fn, ms }
      pending.push(t)
      return t
    },
    clearTimeout: (t) => {
      const i = pending.indexOf(t)
      if (i >= 0) pending.splice(i, 1)
    },
    /** Run the earliest timer and wait for what it started. */
    async tick() {
      const t = pending.shift()
      await t.fn()
      await new Promise((resolve) => setImmediate(resolve))
      return t.ms
    }
  }
}

function harness({
  intervalMs,
  inPlace = true,
  answers = [],
  prefs,
  feedUrl = 'https://update.tracy.ai/desktop',
  platform = 'darwin',
  arch = 'arm64',
  native = platform === 'darwin' && inPlace,
  remindAfterMs,
  remindEveryMs
} = {}) {
  const updater = fakeUpdater()
  // MacUpdater's own Squirrel.Mac (electron's autoUpdater): emits update-downloaded once it prepared one.
  if (native) updater.nativeUpdater = new EventEmitter()
  const reminders = []
  const timers = fakeTimers()
  const asked = []
  const opened = []
  const logs = []
  const clock = { now: 1_000_000 }
  const handle = startUpdater({
    prefs,
    now: () => clock.now,
    autoUpdater: updater,
    channel: 'dev',
    feedUrl,
    feedProvider: SignedProvider,
    platform,
    version: '0.2.0',
    arch,
    osVersion: '27.0.1',
    inPlace,
    timers,
    random: () => 0.5,
    intervalMs,
    ask: async (question) => {
      asked.push(question)
      return answers.shift() ?? 'later'
    },
    openExternal: (url) => opened.push(url),
    log: (line) => logs.push(line),
    remind: (version) => reminders.push({ version, at: clock.now }),
    remindAfterMs,
    remindEveryMs
  })
  const states = []
  handle.onState((state) => states.push(state))
  return { updater, timers, asked, opened, logs, handle, clock, states, reminders }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('the updater is set up: install on quit (Mac), no downgrade after the channel, no differential download', () => {
  const { updater } = harness()
  assert.equal(updater.channel, 'dev')
  assert.equal(updater.allowDowngrade, false)
  assert.equal(updater.autoInstallOnAppQuit, true)
  assert.equal(updater.disableDifferentialDownload, true)
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.requestHeaders['App-Version'], '0.2.0')
  assert.equal(updater.requestHeaders['X-Channel'], 'dev')
})

test('allowDowngrade is set after the channel, since setting a channel turns it back on', () => {
  const updater = fakeUpdater()
  const order = []
  Object.defineProperty(updater, 'channel', { set: () => order.push('channel'), get: () => 'dev' })
  Object.defineProperty(updater, 'allowPrerelease', {
    set: () => order.push('allowPrerelease'),
    get: () => false
  })
  Object.defineProperty(updater, 'allowDowngrade', {
    set: () => order.push('allowDowngrade'),
    get: () => false
  })
  startUpdater({
    autoUpdater: updater,
    channel: 'dev',
    feedUrl: 'https://update.tracy.ai/desktop',
    feedProvider: SignedProvider,
    platform: 'darwin',
    version: '0.2.0',
    arch: 'arm64',
    osVersion: '27',
    inPlace: true,
    timers: fakeTimers(),
    random: () => 0.5,
    ask: async () => 'later',
    openExternal: () => {},
    log: () => {}
  })
  assert.deepEqual(order, ['channel', 'allowPrerelease', 'allowDowngrade'])
})

test('only the dev channel takes prerelease versions (X.Y.Z-dev.N)', () => {
  assert.equal(harness().updater.allowPrerelease, true)
  const stable = fakeUpdater()
  startUpdater({
    autoUpdater: stable,
    channel: 'stable',
    feedUrl: 'https://update.tracy.ai/desktop',
    feedProvider: SignedProvider,
    platform: 'darwin',
    version: '0.2.0',
    arch: 'arm64',
    osVersion: '27',
    inPlace: true,
    timers: fakeTimers(),
    random: () => 0.5,
    ask: async () => 'later',
    openExternal: () => {},
    log: () => {}
  })
  assert.equal(stable.allowPrerelease, false)
})

test('first check five seconds after start, then about four hours after a good one', async () => {
  const { updater, timers } = harness()
  assert.equal(timers.pending[0].ms, 5000)
  await timers.tick()
  assert.equal(updater.checks, 1)
  assert.equal(timers.pending[0].ms, 4 * 60 * MINUTE)
})

test('every timer is logged when set, when it fires (with how late) and when code clears it', async () => {
  const { timers, logs, clock, handle } = harness()
  assert.deepEqual(logs.splice(0), [
    'update schedule: automatic checks on, interval 14400000 ms',
    'update timer set: first check after start, in 5000 ms, due 1970-01-01T00:16:45.000Z'
  ])
  // The timer runs seven hours after it was due: the log shows the delay, not just the check.
  clock.now += 5000 + 7 * 60 * MINUTE
  await timers.tick()
  assert.equal(logs[0], `update timer fired: first check after start, ${7 * 60 * MINUTE} ms late`)
  assert.match(logs.at(-1), /^update timer set: next check, in 14400000 ms, due /)
  logs.length = 0
  await handle.setAutoCheck(false)
  assert.match(logs[0], /^update timer cleared: automatic checks switched off \(was due /)
})

test('a shortened interval (a test run) drives the cadence after each good check', async () => {
  const { timers, logs } = harness({ intervalMs: 2 * MINUTE })
  assert.equal(logs[0], 'update schedule: automatic checks on, interval 120000 ms')
  await timers.tick()
  assert.equal(timers.pending[0].ms, 2 * MINUTE)
  await timers.tick()
  assert.equal(timers.pending[0].ms, 2 * MINUTE)
})

test('failed checks back off 5, 10 minutes, and a good one goes back to the normal cadence', async () => {
  const { updater, timers } = harness()
  updater.next = [{ error: 'offline' }, { error: 'offline' }, { available: false }]
  await timers.tick()
  assert.equal(timers.pending[0].ms, 5 * MINUTE)
  await timers.tick()
  assert.equal(timers.pending[0].ms, 10 * MINUTE)
  await timers.tick()
  assert.equal(timers.pending[0].ms, 4 * 60 * MINUTE)
  assert.equal(updater.checks, 3)
})

test('a downloaded update asks nothing on a Mac: no dialog, nothing installs until quit or Restart', async () => {
  const { updater, asked, handle } = harness()
  updater.emit('update-downloaded', { version: '0.2.1' })
  await settle()
  assert.deepEqual(asked, [])
  assert.deepEqual(updater.installs, [])
  handle.restartToUpdate()
  handle.restartToUpdate()
  assert.deepEqual(updater.installs, [[false, true]])
})

test('install on quit: Mac (Squirrel) and AppImage yes; Windows NSIS keeps the Restart question; a copy that cannot replace itself never', () => {
  assert.equal(harness({ platform: 'darwin' }).updater.autoInstallOnAppQuit, true)
  assert.equal(harness({ platform: 'linux', arch: 'x64' }).updater.autoInstallOnAppQuit, true)
  assert.equal(harness({ platform: 'win32', arch: 'x64' }).updater.autoInstallOnAppQuit, false)
  assert.equal(harness({ inPlace: false }).updater.autoInstallOnAppQuit, false)
  assert.equal(harness({ platform: 'darwin' }).handle.installMode(), 'quit')
  assert.equal(harness({ platform: 'linux', arch: 'x64' }).handle.installMode(), 'quit')
  assert.equal(harness({ platform: 'win32', arch: 'x64' }).handle.installMode(), 'restart')
  assert.equal(harness({ inPlace: false }).handle.installMode(), 'manual')
})

test('Windows: a downloaded version asks once per version; Restart installs it', async () => {
  const { updater, asked } = harness({ platform: 'win32', arch: 'x64', answers: ['restart'] })
  updater.emit('update-downloaded', { version: '0.2.1' })
  updater.emit('update-downloaded', { version: '0.2.1' })
  await settle()
  assert.deepEqual(asked, [{ kind: 'downloaded', version: '0.2.1' }])
  assert.deepEqual(updater.installs, [[false, true]])
})

test('Mac: "staged" only once Squirrel itself says it prepared the version, in the order versions were handed to it', async () => {
  const { updater, handle, logs } = harness()
  updater.emit('update-downloaded', { version: '0.2.1' })
  await settle()
  assert.equal(handle.getState().stagedVersion, null)
  updater.emit('update-downloaded', { version: '0.2.2' })
  updater.nativeUpdater.emit('update-downloaded')
  assert.equal(handle.getState().stagedVersion, '0.2.1')
  updater.nativeUpdater.emit('update-downloaded')
  assert.equal(handle.getState().stagedVersion, '0.2.2')
  assert.ok(logs.some((l) => /Squirrel prepared 0\.2\.1/.test(l)))
})

test('Mac: Squirrel refusing a version (its own error event) is logged and that version is not staged', async () => {
  const { updater, handle, logs } = harness()
  updater.emit('update-downloaded', { version: '0.2.1' })
  updater.nativeUpdater.emit('error', new Error('Code signature did not pass validation'))
  updater.emit('error', new Error('Code signature did not pass validation'))
  await settle()
  assert.equal(handle.getState().stagedVersion, null)
  assert.ok(logs.some((l) => /Squirrel refused 0\.2\.1/.test(l)))
})

test('AppImage: a downloaded version is staged at once (the updater installs the file on quit); Windows never', async () => {
  const linux = harness({ platform: 'linux', arch: 'x64' })
  linux.updater.emit('update-downloaded', { version: '0.2.1' })
  assert.equal(linux.handle.getState().stagedVersion, '0.2.1')
  const win = harness({ platform: 'win32', arch: 'x64', answers: ['later'] })
  win.updater.emit('update-downloaded', { version: '0.2.1' })
  assert.equal(win.handle.getState().stagedVersion, null)
})

test('a version ready for three days brings one reminder, then one a day — never two in a day', async () => {
  const DAY = 24 * 60 * MINUTE
  const { updater, timers, clock, reminders } = harness()
  updater.emit('update-downloaded', { version: '0.2.1' })
  await settle()
  const reminderTimer = () => timers.pending.find((t) => t.ms >= DAY)
  // A timer that fires is gone from the pending list, as a real one is.
  const fire = async (t) => {
    timers.pending.splice(timers.pending.indexOf(t), 1)
    await t.fn()
  }
  assert.equal(reminderTimer().ms, 3 * DAY)
  clock.now += 3 * DAY
  await fire(reminderTimer())
  assert.deepEqual(reminders, [{ version: '0.2.1', at: clock.now }])
  assert.equal(reminderTimer().ms, DAY)
  // A newer version downloaded meanwhile neither resets the wait nor brings a second reminder today.
  updater.emit('update-downloaded', { version: '0.2.2' })
  await settle()
  assert.equal(reminders.length, 1)
  clock.now += DAY
  await fire(reminderTimer())
  assert.deepEqual(
    reminders.map((r) => r.version),
    ['0.2.1', '0.2.2']
  )
})

test('a test run can shorten the reminder waits', async () => {
  const { updater, timers, reminders, clock } = harness({ remindAfterMs: 60_000, remindEveryMs: 120_000 })
  updater.emit('update-downloaded', { version: '0.2.1' })
  await settle()
  const t = timers.pending.find((p) => p.ms === 60_000)
  clock.now += 60_000
  await t.fn()
  assert.equal(reminders.length, 1)
  assert.ok(timers.pending.some((p) => p.ms === 120_000))
})

test('an install the native updater refuses is logged, not thrown, and can be tried again', async () => {
  const { updater, logs, handle } = harness()
  updater.installThrows = 'Code signature did not pass validation'
  updater.emit('update-downloaded', { version: '0.2.1' })
  handle.restartToUpdate()
  await settle()
  assert.ok(logs.some((l) => l.includes('Code signature did not pass validation')))
  updater.installThrows = undefined
  handle.restartToUpdate()
  assert.equal(updater.installs.length, 2)
})

test('an ad-hoc signed copy does not download; it tells the person and offers the download page', async () => {
  const { updater, timers, asked, opened } = harness({ inPlace: false, answers: ['download'] })
  assert.equal(updater.autoDownload, false)
  updater.next = [{ available: true, version: '0.2.1' }]
  await timers.tick()
  await settle()
  assert.equal(updater.downloads, 0)
  assert.equal(asked[0].kind, 'available')
  assert.deepEqual(opened, ['https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.2.1-arm64.dmg'])
})

test('the download page is the dmg the channel file lists for this arch, inside its release folder', async () => {
  const { updater, timers, opened } = harness({ inPlace: false, answers: ['download'] })
  updater.next = [
    {
      available: true,
      version: '0.3.0-dev.2',
      files: [
        { url: 'dev/0.3.0-dev.2/b-7/Tracy-Cowork-Dev-0.3.0-dev.2-arm64.zip' },
        { url: 'dev/0.3.0-dev.2/b-7/Tracy-Cowork-Dev-0.3.0-dev.2-x64.dmg' },
        { url: 'dev/0.3.0-dev.2/b-7/Tracy-Cowork-Dev-0.3.0-dev.2-arm64.dmg' }
      ]
    }
  ]
  await timers.tick()
  await settle()
  assert.deepEqual(opened, [
    'https://update.tracy.ai/desktop/dev/0.3.0-dev.2/b-7/Tracy-Cowork-Dev-0.3.0-dev.2-arm64.dmg'
  ])
})

test('the download page prefers the universal dmg: one file that runs on either chip', async () => {
  const { updater, timers, opened } = harness({ inPlace: false, answers: ['download'] })
  updater.next = [
    {
      available: true,
      version: '0.3.0-dev.3',
      files: [
        { url: 'dev/0.3.0-dev.3/b-8/Tracy-Cowork-Dev-0.3.0-dev.3-arm64.zip' },
        { url: 'dev/0.3.0-dev.3/b-8/Tracy-Cowork-Dev-0.3.0-dev.3-arm64.dmg' },
        { url: 'dev/0.3.0-dev.3/b-8/Tracy-Cowork-Dev-0.3.0-dev.3-universal.dmg' }
      ]
    }
  ]
  await timers.tick()
  await settle()
  assert.deepEqual(opened, [
    'https://update.tracy.ai/desktop/dev/0.3.0-dev.3/b-8/Tracy-Cowork-Dev-0.3.0-dev.3-universal.dmg'
  ])
})

test('"Check for Updates…" checks now and says so when the app is current', async () => {
  const { updater, asked, handle } = harness()
  await handle.checkNow()
  assert.equal(updater.checks, 1)
  assert.equal(asked.at(-1).kind, 'current')
  assert.equal(asked.at(-1).version, '0.2.0')
})

test('"Check for Updates…" says when the check failed', async () => {
  const { updater, asked, handle } = harness()
  updater.next = [{ error: 'getaddrinfo ENOTFOUND update.tracy.ai' }]
  await handle.checkNow()
  assert.equal(asked.at(-1).kind, 'failed')
})

test('stop clears the pending check', () => {
  const { timers, handle } = harness()
  handle.stop()
  assert.equal(timers.pending.length, 0)
})

test('the install id is the UUID electron-updater keeps in userData/.updaterId, nothing else', (t) => {
  const dir = tempDir(t, 'updater-id-')
  assert.equal(readInstallId(dir), null)
  writeFileSync(path.join(dir, '.updaterId'), 'not-a-uuid')
  assert.equal(readInstallId(dir), null)
  writeFileSync(path.join(dir, '.updaterId'), '3b2f9cbd-80a6-5c1e-9a8b-0123456789ab')
  assert.equal(readInstallId(dir), '3b2f9cbd-80a6-5c1e-9a8b-0123456789ab')
})

test('a scheduled re-check never asks; "Check for Updates…" asks about the ready version, as a question', async () => {
  const { updater, timers, asked, handle } = harness({ answers: ['later'] })
  updater.emit('update-downloaded', { version: '0.2.1' })
  await settle()
  updater.next = [{ available: true, version: '0.2.1' }]
  await timers.tick()
  updater.emit('update-downloaded', { version: '0.2.1' })
  await settle()
  assert.equal(asked.length, 0)
  updater.next = [{ available: true, version: '0.2.1' }]
  await handle.checkNow()
  assert.deepEqual(asked, [{ kind: 'downloaded', version: '0.2.1' }])
  assert.deepEqual(updater.installs, [])
})

test('"Check for Updates…" while the new version is still downloading says so', async () => {
  const { updater, asked, handle } = harness()
  updater.next = [{ available: true, version: '0.2.1' }]
  await handle.checkNow()
  assert.deepEqual(asked.at(-1), { kind: 'downloading', version: '0.2.1' })
})

test('an install the native updater refuses later, by an error event, can also be tried again', async () => {
  const { updater, logs, handle } = harness()
  updater.emit('update-downloaded', { version: '0.2.1' })
  handle.restartToUpdate()
  assert.equal(updater.installs.length, 1)
  updater.emit('error', new Error('Code signature at URL did not pass validation'))
  assert.ok(logs.some((l) => l.includes('did not pass validation')))
  handle.restartToUpdate()
  assert.equal(updater.installs.length, 2)
})

// ── Settings › Help & about: the page's half (state, page check, Later, Restart, the switch) ──

/** A preferences store in memory; `failWrites` makes the next writes reject. */
function memoryPrefs(autoCheck = true) {
  const p = {
    saved: { autoCheck },
    writes: 0,
    failWrites: false,
    read: () => ({ ...p.saved }),
    write: async (next) => {
      p.writes++
      if (p.failWrites) throw new Error('disk full')
      p.saved = { autoCheck: next.autoCheck }
    }
  }
  return p
}

/** A promise the test releases by hand. */
function deferred() {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('the page reads a state that starts idle (not "up to date") and moves with each event', async () => {
  const { handle, clock, asked } = harness()
  assert.equal(handle.getState().status, 'idle')
  clock.now = 2_000_000
  await handle.check()
  assert.equal(handle.getState().status, 'current')
  assert.equal(handle.getState().lastCheckedAt, 2_000_000)
  // The page's check reports on the page only: no dialog.
  assert.deepEqual(asked, [])
})

test('one check at a time: the menu, the page and the timer share the one that runs', async () => {
  const { updater, timers, handle, asked } = harness()
  const gate = deferred()
  updater.gate = gate.promise
  const fromTimer = timers.tick()
  const fromPage = handle.check()
  const fromMenu = handle.checkNow()
  gate.release()
  await Promise.all([fromTimer, fromPage, fromMenu])
  assert.equal(updater.checks, 1)
  // The menu still answers with its dialog.
  assert.equal(asked.at(-1).kind, 'current')
})

test('no "ready to install" dialog on a Mac, and the page sees the download progress', async () => {
  const { updater, handle, asked, states } = harness()
  updater.next = [{ available: true, version: '0.3.0', notes: '- New\r\n- Fixed' }]
  await handle.check()
  assert.equal(handle.getState().status, 'downloading')
  updater.emit('download-progress', { percent: 12.4 })
  updater.emit('download-progress', { percent: 12.45 })
  updater.emit('download-progress', { percent: 57 })
  assert.equal(handle.getState().percent, 57)
  // Repeated progress at the same whole percent is not pushed again.
  assert.equal(states.filter((s) => s.percent === 12).length, 1)
  updater.emit('update-downloaded', { version: '0.3.0' })
  updater.emit('update-downloaded', { version: '0.3.0' })
  await settle()
  assert.equal(asked.length, 0)
  assert.equal(handle.getState().status, 'downloaded')
  assert.equal(handle.getState().releaseNotes, '- New\n- Fixed')
})

test('Restart on the page asks the native question first, and only for a downloaded version', async () => {
  const { updater, handle, asked } = harness({ answers: ['restart'] })
  assert.equal(await handle.restart(), false)
  assert.deepEqual(asked, [])
  updater.emit('update-downloaded', { version: '0.3.0' })
  await settle()
  assert.equal(asked.length, 0)
  assert.equal(await handle.restart(), true)
  assert.deepEqual(asked, [{ kind: 'downloaded', version: '0.3.0' }])
  assert.deepEqual(updater.installs, [[false, true]])
  assert.equal(handle.getState().status, 'installing')
})

test('Restart while the native question is already on screen does not open a second one', async () => {
  const updater = fakeUpdater()
  const pending = deferred()
  const asked = []
  const handle = startUpdater({
    autoUpdater: updater,
    channel: 'dev',
    feedUrl: 'https://update.tracy.ai/desktop',
    feedProvider: SignedProvider,
    platform: 'darwin',
    version: '0.2.0',
    arch: 'arm64',
    osVersion: '27',
    inPlace: true,
    timers: fakeTimers(),
    random: () => 0.5,
    ask: (q) => {
      asked.push(q)
      return pending.promise
    },
    openExternal: () => {},
    log: () => {}
  })
  updater.emit('update-downloaded', { version: '0.3.0' })
  const fromPage = handle.restart()
  assert.equal(asked.length, 1)
  pending.release('restart')
  await fromPage
  assert.equal(updater.installs.length, 1)
})

test('an install refused after Restart is an install error, apart from network errors, and can be retried', async () => {
  const { updater, handle } = harness({ answers: ['restart', 'restart'] })
  updater.emit('update-downloaded', { version: '0.3.0' })
  await settle()
  assert.equal(await handle.restart(), true)
  assert.equal(handle.getState().status, 'installing')
  updater.emit('error', new Error('Code signature did not pass validation'))
  assert.equal(handle.getState().status, 'install-error')
  assert.equal(await handle.restart(), true)
  assert.equal(updater.installs.length, 2)
})

test('a failed check shows when the next automatic try is, on the fake clock', async () => {
  const { updater, timers, handle, clock } = harness()
  updater.next = [{ error: 'offline' }]
  clock.now = 10_000_000
  await timers.tick()
  assert.equal(handle.getState().status, 'error')
  assert.equal(handle.getState().nextRetryAt, 10_000_000 + 5 * MINUTE)
  assert.equal(timers.pending[0].ms, 5 * MINUTE)
})

test('automatic checks off (saved): nothing is scheduled at start, the page can still check', async () => {
  const { updater, timers, handle } = harness({ prefs: memoryPrefs(false) })
  assert.equal(timers.pending.length, 0)
  assert.equal(handle.getState().autoCheck, false)
  await handle.check()
  assert.equal(updater.checks, 1)
  assert.equal(timers.pending.length, 0)
  updater.next = [{ error: 'offline' }]
  await handle.check()
  assert.equal(handle.getState().nextRetryAt, null)
  assert.equal(timers.pending.length, 0)
})

test('switching automatic checks off cancels the start-up, the 4-hour and the backoff timers', async () => {
  for (const before of ['startup', 'interval', 'backoff']) {
    const prefs = memoryPrefs(true)
    const { updater, timers, handle } = harness({ prefs })
    if (before !== 'startup') {
      if (before === 'backoff') updater.next = [{ error: 'offline' }]
      await timers.tick()
    }
    assert.equal(timers.pending.length, 1, before)
    await handle.setAutoCheck(false)
    assert.equal(timers.pending.length, 0, before)
    assert.deepEqual(prefs.saved, { autoCheck: false })
    assert.equal(handle.getState().autoCheck, false)
    assert.equal(handle.getState().nextRetryAt, null)
  }
})

test('a check already running when the switch goes off finishes, and schedules nothing after it', async () => {
  const { updater, timers, handle } = harness({ prefs: memoryPrefs(true) })
  const gate = deferred()
  updater.gate = gate.promise
  const running = timers.tick()
  await handle.setAutoCheck(false)
  gate.release()
  await running
  assert.equal(updater.checks, 1)
  assert.equal(timers.pending.length, 0)
})

test('switching it back on brings exactly one early check, however often it is pressed', async () => {
  const { timers, handle } = harness({ prefs: memoryPrefs(false) })
  await handle.setAutoCheck(true)
  await handle.setAutoCheck(true)
  assert.equal(timers.pending.length, 1)
  assert.equal(timers.pending[0].ms, 5000)
})

test('quick off/on/off presses end in the last choice, saved and scheduled accordingly', async () => {
  const prefs = memoryPrefs(true)
  const { timers, handle } = harness({ prefs })
  await Promise.all([handle.setAutoCheck(false), handle.setAutoCheck(true), handle.setAutoCheck(false)])
  assert.deepEqual(prefs.saved, { autoCheck: false })
  assert.equal(handle.getState().autoCheck, false)
  assert.equal(timers.pending.length, 0)
})

test('a switch that could not be saved says so and changes nothing', async () => {
  const prefs = memoryPrefs(true)
  const { timers, handle } = harness({ prefs })
  prefs.failWrites = true
  await assert.rejects(handle.setAutoCheck(false), /disk full/)
  assert.equal(handle.getState().autoCheck, true)
  assert.equal(timers.pending.length, 1)
  await assert.rejects(handle.setAutoCheck('off'), /boolean/)
})

test('onState stops calling after unsubscribe', async () => {
  const { handle } = harness()
  const seen = []
  const off = handle.onState((s) => seen.push(s.status))
  await handle.check()
  off()
  const count = seen.length
  await handle.check()
  assert.ok(count > 0)
  assert.equal(seen.length, count)
})

test('Download on the page opens the checked dmg address of an ad-hoc copy, nothing else', async () => {
  const { updater, handle, opened } = harness({ inPlace: false, answers: ['later'] })
  assert.equal(handle.download(), false)
  updater.next = [{ available: true, version: '0.3.0' }]
  await handle.check()
  assert.equal(handle.getState().status, 'available-manual')
  assert.equal(handle.download(), true)
  assert.deepEqual(opened, ['https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.3.0-arm64.dmg'])
})

test('the dmg address must stay on the feed: another origin, credentials or plain http fall back or stop', async () => {
  const listed = async (url, feedUrl) => {
    const { updater, handle, opened } = harness({ inPlace: false, answers: ['later'], feedUrl })
    updater.next = [{ available: true, version: '0.3.0', files: [{ url }] }]
    await handle.check()
    handle.download()
    return opened
  }
  const flat = ['https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.3.0-arm64.dmg']
  assert.deepEqual(await listed('https://evil.example/Tracy-Cowork-Dev-0.3.0-arm64.dmg'), flat)
  assert.deepEqual(await listed('https://u:p@update.tracy.ai/desktop/Tracy-Cowork-Dev-0.3.0-arm64.dmg'), flat)
  assert.deepEqual(await listed('http://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.3.0-arm64.dmg'), flat)
  assert.deepEqual(await listed('dev/0.3.0/b/Other-0.3.0-arm64.dmg'), flat)
  // A feed on plain http off this machine has no download address at all.
  assert.deepEqual(await listed('x-arm64.dmg', 'http://update.example/desktop'), [])
  // A local test feed on loopback http is allowed.
  assert.deepEqual(await listed('dev/Tracy-Cowork-Dev-0.3.0-arm64.dmg', 'http://127.0.0.1:8765/feed'), [
    'http://127.0.0.1:8765/feed/dev/Tracy-Cowork-Dev-0.3.0-arm64.dmg'
  ])
})

test('a version that is not a version opens nothing', async () => {
  const { updater, handle, opened, logs } = harness({ inPlace: false, answers: ['download'] })
  updater.next = [{ available: true, version: '../../evil' }]
  await handle.check()
  await settle()
  handle.download()
  assert.deepEqual(opened, [])
  assert.ok(logs.some((l) => /no download address/.test(l)))
})

test('a check the page asked for reports on the page only: an ad-hoc copy gets no native dialog, now or on the next timer check', async () => {
  const { updater, timers, handle, asked } = harness({ inPlace: false })
  updater.next = [
    { available: true, version: '0.3.0' },
    { available: true, version: '0.3.0' }
  ]
  await handle.check()
  assert.equal(handle.getState().status, 'available-manual')
  await timers.tick()
  assert.deepEqual(asked, [])
})

test('a universal dmg listed off the feed is never preferred over this arch on the feed', async () => {
  const { updater, timers, opened } = harness({ inPlace: false, answers: ['download'] })
  updater.next = [
    {
      available: true,
      version: '0.3.0-dev.3',
      files: [
        { url: 'https://evil.example.test/Tracy-Cowork-Dev-0.3.0-dev.3-universal.dmg' },
        { url: 'dev/0.3.0-dev.3/b-9/Tracy-Cowork-Dev-0.3.0-dev.3-arm64.dmg' }
      ]
    }
  ]
  await timers.tick()
  await settle()
  assert.deepEqual(opened, [
    'https://update.tracy.ai/desktop/dev/0.3.0-dev.3/b-9/Tracy-Cowork-Dev-0.3.0-dev.3-arm64.dmg'
  ])
})

// ── signed feed, Windows and Linux (tasks/todo-desktop-windows.md W3) ────────────────────────────

test('the feed is read only through the signed provider, at the feed app-update.yml names', () => {
  const { updater } = harness()
  assert.deepEqual(updater.feedConfig, {
    provider: 'custom',
    updateProvider: SignedProvider,
    url: 'https://update.tracy.ai/desktop'
  })
})

test('an updater without the signed provider does not start: it would trust whoever controls the feed', () => {
  assert.throws(
    () =>
      startUpdater({
        autoUpdater: fakeUpdater(),
        channel: 'stable',
        feedUrl: 'https://update.tracy.ai/desktop',
        platform: 'win32',
        version: '0.4.0',
        arch: 'x64',
        osVersion: '10.0.26100',
        inPlace: true,
        timers: fakeTimers(),
        random: () => 0.5,
        ask: async () => 'later',
        openExternal: () => {},
        log: () => {}
      }),
    /signed feed provider/
  )
})

test('Windows: no web installer, no differential download, no downgrade, and the installer downloads in place', () => {
  const { updater } = harness({ platform: 'win32', arch: 'x64' })
  assert.equal(updater.disableWebInstaller, true)
  assert.equal(updater.disableDifferentialDownload, true)
  assert.equal(updater.allowDowngrade, false)
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.autoInstallOnAppQuit, false)
})

test('a feed refused for its signature is a failed check: the app keeps running, nothing is offered, it retries later', async () => {
  const { updater, timers, asked, handle } = harness({ platform: 'win32', arch: 'x64' })
  updater.next = [
    { error: 'update feed refused: the signature of stable.yml does not match it under any pinned key' }
  ]
  await timers.tick()
  assert.equal(handle.getState().status, 'error')
  assert.equal(updater.downloads, 0)
  assert.deepEqual(asked, [])
  assert.equal(timers.pending.length, 1)
  assert.equal(timers.pending[0].ms, 5 * MINUTE)
})

test('a Linux .deb copy cannot replace itself: it offers the .deb of its arch the channel file lists', async () => {
  const { updater, timers, opened, asked } = harness({
    platform: 'linux',
    arch: 'arm64',
    inPlace: false,
    answers: ['download']
  })
  updater.next = [
    {
      available: true,
      version: '0.4.0-dev.2',
      files: [
        { url: 'dev/0.4.0-dev.2/b/Tracy-Cowork-Dev-0.4.0-dev.2-linux-arm64.AppImage' },
        { url: 'dev/0.4.0-dev.2/b/Tracy-Cowork-Dev-0.4.0-dev.2-linux-arm64.deb' }
      ]
    }
  ]
  await timers.tick()
  await settle()
  assert.equal(updater.downloads, 0)
  assert.equal(asked[0].kind, 'available')
  assert.deepEqual(opened, [
    'https://update.tracy.ai/desktop/dev/0.4.0-dev.2/b/Tracy-Cowork-Dev-0.4.0-dev.2-linux-arm64.deb'
  ])
})

test('a Linux link with nothing listed falls back to the flat .deb name; Windows to the setup exe of its arch', async () => {
  const link = async (platform, arch) => {
    const { updater, handle, opened } = harness({ platform, arch, inPlace: false, answers: ['later'] })
    updater.next = [{ available: true, version: '0.4.0' }]
    await handle.check()
    handle.download()
    return opened
  }
  assert.deepEqual(await link('linux', 'x64'), [
    'https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.4.0-linux-x64.deb'
  ])
  assert.deepEqual(await link('win32', 'arm64'), [
    'https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.4.0-win-arm64-setup.exe'
  ])
})

test('a link of another platform or arch on the feed is never offered', async () => {
  const { updater, handle, opened } = harness({
    platform: 'linux',
    arch: 'x64',
    inPlace: false,
    answers: ['later']
  })
  updater.next = [
    {
      available: true,
      version: '0.4.0',
      files: [
        { url: 'dev/0.4.0/b/Tracy-Cowork-Dev-0.4.0-linux-arm64.deb' },
        { url: 'dev/0.4.0/b/Tracy-Cowork-Dev-0.4.0-universal.dmg' }
      ]
    }
  ]
  await handle.check()
  handle.download()
  assert.deepEqual(opened, ['https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.4.0-linux-x64.deb'])
})

// ── The blocked screen's Update (tasks/todo-desktop-update-policy.md C7) ───────────────────────────

test('Update when blocked, a version already downloaded: installs it now, no question', async () => {
  const { updater, handle, asked } = harness()
  updater.emit('update-downloaded', { version: '0.3.0' })
  const result = await handle.updateNow({ minimumVersion: '0.3.0' })
  assert.deepEqual(result, { outcome: 'installing', version: '0.3.0' })
  assert.deepEqual(asked, [])
  assert.deepEqual(updater.installs, [[false, true]])
})

test('Update when blocked, nothing downloaded: checks, waits for the download, then installs', async () => {
  const { updater, handle } = harness()
  updater.next = [{ available: true, version: '0.3.0' }]
  const pending = handle.updateNow({ minimumVersion: '0.3.0' })
  await settle()
  assert.deepEqual(updater.installs, [])
  updater.emit('update-downloaded', { version: '0.3.0' })
  assert.deepEqual(await pending, { outcome: 'installing', version: '0.3.0' })
  assert.equal(updater.installs.length, 1)
})

test('Update when blocked: the feed offers nothing this copy can take (system too old, no file for this arch) → unavailable, no loop', async () => {
  const { updater, handle } = harness()
  updater.next = [{ available: false }]
  assert.deepEqual(await handle.updateNow({ minimumVersion: '0.3.0' }), {
    outcome: 'unavailable',
    version: null
  })
  // A version still below the minimum is no way out either.
  updater.next = [{ available: true, version: '0.2.5' }]
  const below = handle.updateNow({ minimumVersion: '0.3.0' })
  assert.deepEqual(await below, { outcome: 'unavailable', version: '0.2.5' })
  assert.equal(updater.checks, 2)
})

test('Update when blocked: a failed check or download says why', async () => {
  const { updater, handle } = harness()
  updater.next = [{ error: 'net::ERR_INTERNET_DISCONNECTED' }]
  assert.deepEqual(await handle.updateNow({ minimumVersion: '0.3.0' }), {
    outcome: 'failed',
    reason: 'net::ERR_INTERNET_DISCONNECTED'
  })
  updater.next = [{ available: true, version: '0.3.0' }]
  const pending = handle.updateNow({ minimumVersion: '0.3.0' })
  await settle()
  updater.emit('error', new Error('Cannot find file for arch arm64'))
  assert.deepEqual(await pending, { outcome: 'failed', reason: 'Cannot find file for arch arm64' })
})

test('Update when blocked on a copy that cannot replace itself: opens the checked download address', async () => {
  const { updater, handle, opened } = harness({ inPlace: false })
  updater.next = [{ available: true, version: '0.3.0' }]
  assert.deepEqual(await handle.updateNow({ minimumVersion: '0.3.0' }), { outcome: 'link', version: '0.3.0' })
  assert.deepEqual(opened, ['https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.3.0-arm64.dmg'])
})

test('the blocked screen’s Download opens the checked address of the newest version offered, else of the one named', async () => {
  const { updater, handle, opened, timers } = harness()
  handle.openDownload('0.3.0')
  assert.deepEqual(opened, ['https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.3.0-arm64.dmg'])
  updater.next = [{ available: true, version: '0.3.2' }]
  await timers.tick()
  handle.openDownload('0.3.0')
  assert.equal(opened.at(-1), 'https://update.tracy.ai/desktop/Tracy-Cowork-Dev-0.3.2-arm64.dmg')
  handle.openDownload(null)
  assert.equal(opened.length, 3)
  // Nothing offered and nothing named: nothing opens.
  const fresh = harness()
  fresh.handle.openDownload(null)
  assert.deepEqual(fresh.opened, [])
})
