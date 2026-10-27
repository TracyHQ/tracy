/**
 * The notify bridge (`src/notify-bridge.js`): `app.notifications.*` — a system notification when an
 * agent's turn ends while no Tracy window is in front. The page reports the turn; the main process
 * decides (dedupe across windows, the switch, focus, rate) and shows it. Driven with a stand-in
 * Electron `Notification` and stand-in windows.
 *
 *   node --test packages/desktop/tracy-desktop/test/notify-bridge.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createNotifyBridge } = require('../src/notify-bridge.js')
const { NOTIFY_CHANNELS } = require('../src/update-channels.js')

const ORIGIN = 'https://cowork.tracy.site'

function fakeNotificationClass({ supported = true } = {}) {
  class FakeNotification extends EventEmitter {
    static supported = supported
    static made = []
    static isSupported() {
      return FakeNotification.supported
    }
    constructor(options) {
      super()
      this.options = options
      this.shown = 0
      FakeNotification.made.push(this)
    }
    show() {
      this.shown++
    }
  }
  return FakeNotification
}

function fakeWindow() {
  const contents = new EventEmitter()
  contents.mainFrame = { url: `${ORIGIN}/` }
  contents.sent = []
  contents.send = (channel, payload) => contents.sent.push([channel, payload])
  const window = new EventEmitter()
  Object.assign(window, {
    webContents: contents,
    destroyed: false,
    focused: false,
    minimized: false,
    calls: [],
    isDestroyed: () => window.destroyed,
    isFocused: () => window.focused,
    isMinimized: () => window.minimized,
    restore: () => window.calls.push('restore'),
    show: () => window.calls.push('show'),
    focus: () => window.calls.push('focus')
  })
  return window
}

function memoryPrefs(enabled = true) {
  const prefs = {
    doc: { autoCheck: true, onboarding: {}, notifications: { enabled, sound: 'system' } },
    read: () => structuredClone(prefs.doc),
    update: async (patch) => {
      // As src/preferences.js: notifications fields land on the saved ones.
      const n = { ...prefs.doc.notifications, ...patch?.notifications }
      if (typeof n.enabled !== 'boolean' || typeof n.sound !== 'string') throw new TypeError('bad')
      prefs.doc = { ...prefs.doc, notifications: n }
      return prefs.read()
    }
  }
  return prefs
}

function setup({ supported = true, enabled = true, platform = 'darwin', ...extra } = {}) {
  const handlers = new Map()
  const ipcMain = {
    handlers,
    handle: (channel, fn) => handlers.set(channel, fn),
    removeHandler: (channel) => handlers.delete(channel)
  }
  const Notification = fakeNotificationClass({ supported })
  const clock = { now: 100_000 }
  const opened = []
  const windows = [fakeWindow(), fakeWindow()]
  const prefs = memoryPrefs(enabled)
  const bridge = createNotifyBridge({
    ipcMain,
    origin: ORIGIN,
    Notification,
    windows: () => windows.filter((w) => !w.destroyed),
    prefs,
    platform,
    now: () => clock.now,
    openExternal: (url) => opened.push(url),
    ...extra
  })
  for (const window of windows) bridge.attach(window)
  const top = (window = windows[0]) => ({
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame
  })
  const call = (channel, arg, window) => handlers.get(channel)(top(window), arg)
  return { ipcMain, Notification, clock, opened, windows, prefs, bridge, call }
}

let turnCount = 0
const turn = (more = {}) => ({
  sessionId: 's1',
  turnId: `t${++turnCount}`,
  outcome: 'completed',
  title: 'Homepage copy',
  body: 'The agent finished.',
  ...more
})

test('a turn that ends while no window is in front is shown, cut to size', async () => {
  const { call, Notification, clock } = setup()
  const answer = await call(
    NOTIFY_CHANNELS.turnFinished,
    turn({ title: 'T'.repeat(300), body: 'B'.repeat(300) })
  )
  assert.deepEqual(answer, { decision: 'shown' })
  const [n] = Notification.made
  assert.equal(n.shown, 1)
  assert.equal(n.options.title.length, 120)
  assert.equal(n.options.body.length, 240)
  assert.equal((await call(NOTIFY_CHANNELS.status)).lastShownAt, clock.now)
})

test('the same turn reported by two windows is shown once', async () => {
  const { call, windows, Notification, clock } = setup()
  const t = turn()
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, t, windows[0])).decision, 'shown')
  clock.now += 10_000
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, { ...t }, windows[1])).decision, 'duplicate')
  assert.equal(Notification.made.length, 1)
})

test('a turn is decided once even when it was suppressed the first time', async () => {
  const { call, windows } = setup()
  const t = turn()
  windows[1].focused = true
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, t)).decision, 'suppressed-focus')
  windows[1].focused = false
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, t)).decision, 'duplicate')
})

test('while any Tracy window is in front, nothing is shown', async () => {
  const { call, windows, Notification } = setup()
  windows[1].focused = true
  assert.deepEqual(await call(NOTIFY_CHANNELS.turnFinished, turn()), { decision: 'suppressed-focus' })
  assert.equal(Notification.made.length, 0)
})

test('the switch off means off; a system without notifications means unsupported', async () => {
  assert.equal((await setup({ enabled: false }).call(NOTIFY_CHANNELS.turnFinished, turn())).decision, 'off')
  assert.equal(
    (await setup({ supported: false }).call(NOTIFY_CHANNELS.turnFinished, turn())).decision,
    'unsupported'
  )
})

test('at most one notification per 3 s', async () => {
  const { call, clock, Notification } = setup()
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, turn())).decision, 'shown')
  clock.now += 1_000
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, turn())).decision, 'rate-limited')
  clock.now += 3_000
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, turn())).decision, 'shown')
  assert.equal(Notification.made.length, 2)
})

test('a turn report of the wrong shape is refused', async () => {
  const { call } = setup()
  for (const bad of [
    undefined,
    'done',
    turn({ sessionId: 1 }),
    turn({ turnId: '' }),
    turn({ outcome: 'finished' }),
    turn({ title: null }),
    turn({ body: 5 }),
    turn({ sessionId: 'x'.repeat(300) })
  ])
    await assert.rejects(call(NOTIFY_CHANNELS.turnFinished, bad), TypeError, JSON.stringify(bad))
})

test('only the last 200 turns are remembered', async () => {
  const { call, clock } = setup()
  const first = turn()
  await call(NOTIFY_CHANNELS.turnFinished, first)
  for (let i = 0; i < 200; i++) {
    clock.now += 5_000
    await call(NOTIFY_CHANNELS.turnFinished, turn())
  }
  clock.now += 5_000
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, first)).decision, 'shown')
})

test('clicking the notification brings back the window that reported the turn', async () => {
  const { call, windows, Notification } = setup()
  windows[1].minimized = true
  await call(NOTIFY_CHANNELS.turnFinished, turn(), windows[1])
  Notification.made[0].emit('click')
  assert.deepEqual(windows[1].calls, ['restore', 'show', 'focus'])
  assert.deepEqual(windows[0].calls, [])
})

test('when that window has closed, the click brings back another one', async () => {
  const { call, windows, Notification } = setup()
  await call(NOTIFY_CHANNELS.turnFinished, turn(), windows[1])
  windows[1].destroyed = true
  windows[1].emit('closed')
  Notification.made[0].emit('click')
  assert.deepEqual(windows[0].calls, ['show', 'focus'])
})

test('the notification is held until the system closes it', async () => {
  const { call, Notification, bridge } = setup()
  await call(NOTIFY_CHANNELS.turnFinished, turn())
  assert.equal(bridge.heldCount(), 1)
  Notification.made[0].emit('close')
  assert.equal(bridge.heldCount(), 0)
})

test('the test notification has fixed words, ignores focus, and has its own 3 s pause', async () => {
  const { call, windows, Notification, clock } = setup()
  windows[0].focused = true
  const status = await call(NOTIFY_CHANNELS.test, { title: 'Pay now', body: 'evil' })
  assert.deepEqual(
    Notification.made.map((n) => n.options),
    [{ title: 'Tracy Cowork', body: 'This is how a notification looks when the agent is done.' }]
  )
  assert.equal(status.lastShownAt, clock.now)
  clock.now += 1_000
  await call(NOTIFY_CHANNELS.test)
  assert.equal(Notification.made.length, 1)
  clock.now += 3_000
  await call(NOTIFY_CHANNELS.test)
  assert.equal(Notification.made.length, 2)
})

test('status says supported, the switch, an unknown permission and when one was last shown', async () => {
  const { call } = setup()
  assert.deepEqual(await call(NOTIFY_CHANNELS.status), {
    supported: true,
    enabled: true,
    sound: 'system',
    permission: 'unknown',
    lastShownAt: null,
    settingsTarget: true
  })
})

test('the switch takes a boolean only, is saved, and answers with the status', async () => {
  const { call, prefs } = setup()
  for (const bad of ['false', 0, null, undefined])
    await assert.rejects(call(NOTIFY_CHANNELS.setEnabled, bad), TypeError)
  assert.equal((await call(NOTIFY_CHANNELS.setEnabled, false)).enabled, false)
  assert.deepEqual(prefs.doc.notifications, { enabled: false, sound: 'system' })
  assert.equal((await call(NOTIFY_CHANNELS.turnFinished, turn())).decision, 'off')
})

test('Open System Settings opens a fixed place per system and takes no address from the page', async () => {
  for (const [platform, expected] of [
    ['darwin', ['x-apple.systempreferences:com.apple.Notifications-Settings.extension']],
    ['win32', ['ms-settings:notifications']],
    ['linux', []]
  ]) {
    const { call, opened } = setup({ platform })
    assert.equal(await call(NOTIFY_CHANNELS.openSettings, 'https://evil.example/'), undefined)
    assert.deepEqual(opened, expected)
  }
})

test('a page that is not the product page is refused', async () => {
  const { ipcMain } = setup()
  const stranger = fakeWindow()
  await assert.rejects(
    ipcMain.handlers.get(NOTIFY_CHANNELS.test)({
      sender: stranger.webContents,
      senderFrame: stranger.webContents.mainFrame
    }),
    /not allowed/
  )
})

test('dispose removes every handler', () => {
  const { ipcMain, bridge } = setup()
  bridge.dispose()
  assert.equal(ipcMain.handlers.size, 0)
})

test('the sound takes a name from the macOS list only, is saved with the switch, and answers with the status', async () => {
  const { call, prefs } = setup()
  for (const bad of ['Beep', 'glass', '/System/Library/Sounds/Glass.aiff', 7, null, undefined])
    await assert.rejects(call(NOTIFY_CHANNELS.setSound, bad), TypeError, JSON.stringify(bad))
  await call(NOTIFY_CHANNELS.setEnabled, false)
  const status = await call(NOTIFY_CHANNELS.setSound, 'Glass')
  assert.equal(status.sound, 'Glass')
  assert.equal(status.enabled, false)
  assert.deepEqual(prefs.doc.notifications, { enabled: false, sound: 'Glass' })
  assert.equal((await call(NOTIFY_CHANNELS.setSound, 'system')).sound, 'system')
})

test('on macOS a chosen sound goes with the notification and with the test; the system default sends none', async () => {
  const { call, Notification, clock } = setup()
  await call(NOTIFY_CHANNELS.turnFinished, turn())
  assert.equal(Object.hasOwn(Notification.made[0].options, 'sound'), false)
  await call(NOTIFY_CHANNELS.setSound, 'Submarine')
  clock.now += 5_000
  await call(NOTIFY_CHANNELS.turnFinished, turn())
  assert.equal(Notification.made[1].options.sound, 'Submarine')
  clock.now += 5_000
  await call(NOTIFY_CHANNELS.test)
  assert.deepEqual(Notification.made[2].options, {
    title: 'Tracy Cowork',
    body: 'This is how a notification looks when the agent is done.',
    sound: 'Submarine'
  })
})

test('on Windows and Linux no sound option is passed: Electron plays it on macOS only', async () => {
  for (const platform of ['win32', 'linux']) {
    const { call, Notification, clock } = setup({ platform })
    await call(NOTIFY_CHANNELS.setSound, 'Glass')
    await call(NOTIFY_CHANNELS.turnFinished, turn())
    clock.now += 5_000
    await call(NOTIFY_CHANNELS.test)
    assert.equal(Notification.made.length, 2, platform)
    for (const n of Notification.made) assert.equal(Object.hasOwn(n.options, 'sound'), false, platform)
  }
})

test("open settings: macOS and Windows open a settings URL; Linux runs GNOME's control centre only when it is there, and the status says so", async () => {
  const runs = []
  const mac = setup({ platform: 'darwin' })
  assert.equal((await mac.call(NOTIFY_CHANNELS.status)).settingsTarget, true)
  await mac.call(NOTIFY_CHANNELS.openSettings)
  assert.deepEqual(mac.opened, ['x-apple.systempreferences:com.apple.Notifications-Settings.extension'])
  const gnome = setup({
    platform: 'linux',
    hasCommand: () => true,
    spawnDetached: (c, a) => runs.push([c, ...a])
  })
  assert.equal((await gnome.call(NOTIFY_CHANNELS.status)).settingsTarget, true)
  await gnome.call(NOTIFY_CHANNELS.openSettings)
  assert.deepEqual(runs, [['gnome-control-center', 'notifications']])
  assert.deepEqual(gnome.opened, [])
  const bare = setup({
    platform: 'linux',
    hasCommand: () => false,
    spawnDetached: (c, a) => runs.push([c, ...a])
  })
  assert.equal((await bare.call(NOTIFY_CHANNELS.status)).settingsTarget, false, 'the page hides the button')
  await bare.call(NOTIFY_CHANNELS.openSettings)
  assert.equal(runs.length, 1, 'nothing started')
})

/** A permission reader answering from a script; `answers` repeat the last one. */
function scriptedPermission(answers) {
  let i = 0
  const reader = {
    reads: 0,
    read: async () => {
      reader.reads++
      const answer = answers[Math.min(i++, answers.length - 1)]
      if (answer instanceof Error) throw answer
      return answer
    }
  }
  return reader
}

test('macOS: status carries the permission the system reports, read when the page asks', async () => {
  for (const [reported, shown] of [
    ['allowed', 'allowed'],
    ['denied', 'denied'],
    ['notDetermined', 'unknown'],
    ['unknown', 'unknown'],
    ['granted?', 'unknown'],
    [new Error('addon failed'), 'unknown']
  ]) {
    const { call } = setup({ permission: scriptedPermission([reported]) })
    assert.equal((await call(NOTIFY_CHANNELS.status)).permission, shown, String(reported))
  }
})

test('Windows and Linux never ask the reader: the permission stays unknown', async () => {
  for (const platform of ['win32', 'linux']) {
    const permission = scriptedPermission(['allowed'])
    const { call } = setup({ platform, permission })
    assert.equal((await call(NOTIFY_CHANNELS.status)).permission, 'unknown')
    assert.equal(permission.reads, 0)
  }
})

test('a window gaining focus reads the permission again and pushes the status only when it changed', async () => {
  const permission = scriptedPermission(['denied', 'denied', 'allowed'])
  const { call, bridge, windows } = setup({ permission })
  assert.equal((await call(NOTIFY_CHANNELS.status)).permission, 'denied')

  await bridge.refresh()
  assert.deepEqual(windows[0].webContents.sent, [], 'unchanged: nothing pushed')

  await bridge.refresh()
  for (const window of windows) {
    assert.equal(window.webContents.sent.length, 1)
    const [channel, status] = window.webContents.sent[0]
    assert.equal(channel, NOTIFY_CHANNELS.changed)
    assert.equal(status.permission, 'allowed')
    assert.equal(status.enabled, true)
  }
})

test('the page is never pushed to a window that left the pinned origin', async () => {
  const permission = scriptedPermission(['denied', 'allowed'])
  const { call, bridge, windows } = setup({ permission })
  await call(NOTIFY_CHANNELS.status)
  windows[1].webContents.mainFrame.url = 'https://elsewhere.example/'
  await bridge.refresh()
  assert.equal(windows[0].webContents.sent.length, 1)
  assert.equal(windows[1].webContents.sent.length, 0)
})
