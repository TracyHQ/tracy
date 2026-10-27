/**
 * The notify bridge: `window.tracyDesktop.app.notifications` (shell/preload.ts) — a system
 * notification when an agent's turn ends while no Tracy window is in front. Channels in
 * src/update-channels.js. Who may ask: src/bridge-guard.js.
 *
 * THE PAGE REPORTS, THE MAIN PROCESS DECIDES (council 10/10/2026, tasks/todo-desktop-onboard-agent.md
 * §4). `turnFinished({ sessionId, turnId, outcome, title, body })`, in this order:
 * 1. `duplicate` — the turn was already decided, from this window or another (the key is recorded
 *    BEFORE anything else, so a suppressed turn reported again stays suppressed; last 200 kept);
 * 2. `off` — the switch (`preferences.json`, part `notifications`) is off;
 * 3. `unsupported` — the system has no notifications;
 * 4. `suppressed-focus` — some Tracy window is in front at this moment (first policy: "while you are
 *    using Tracy, stay quiet"; the payload carries `sessionId` so a finer policy is one `if` here);
 * 5. `rate-limited` — one was shown less than 3 s ago;
 * 6. `shown` — title cut to 120 characters, body to 240.
 * A click brings back the window that reported the turn, or another product window if it closed.
 * The Notification is held until the system closes it (a dropped reference can lose the click).
 *
 * `permission` (tasks/todo-desktop-onboard-v2.md, contract 7; council d) is what the system says, never
 * a guess from events (`show()` returning proves no banner appeared): on macOS the main process asks
 * `UNUserNotificationCenter` through a small native addon (src/notify-permission.js) and answers
 * `allowed` or `denied`; anything else — not asked yet (`notDetermined`), the addon missing or
 * failing, Windows, Linux — is `unknown`. Read again whenever the page asks for the status and
 * whenever a product window gains focus (`refresh`, from src/main.js: the person may be back from
 * System Settings); a change is pushed to the product pages (`changed`). `test()` shows
 * fixed words (the page passes none), ignores focus, and has its own 3 s pause.
 * `openSystemSettings()` opens a fixed place per system; the page passes no address.
 *
 * SOUND: `setSound(name)` takes `system` or a macOS alert sound name (src/notify-sounds.js). On macOS
 * a chosen sound goes with every notification, the test one included (so the picker can be tried);
 * with `system`, and on Windows and Linux (Electron's `sound` is macOS only), no `sound` is passed.
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createProductBridge } = require('./bridge-guard.js')
const { NOTIFY_CHANNELS } = require('./update-channels.js')
const { DEFAULT_SOUND, isNotifySound } = require('./notify-sounds.js')

const GAP_MS = 3_000
const REMEMBERED_TURNS = 200
const MAX_TITLE = 120
const MAX_BODY = 240
const MAX_ID = 256
const OUTCOMES = Object.freeze(['completed', 'error', 'cancelled', 'needs-input'])
const TEST_NOTIFICATION = Object.freeze({
  title: 'Tracy Cowork',
  body: 'This is how a notification looks when the agent is done.'
})
const SYSTEM_SETTINGS = Object.freeze({
  darwin: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
  win32: 'ms-settings:notifications'
})
/** Linux has no settings URL; GNOME's control centre takes a panel name (measured 11/10/2026 on Ubuntu). */
const LINUX_SETTINGS = Object.freeze({
  command: 'gnome-control-center',
  args: Object.freeze(['notifications'])
})

/** At most `max` characters (code points, so an emoji is never cut in half). */
const cut = (text, max) => Array.from(text).slice(0, max).join('')

/** Throws a TypeError unless `input` is a turn report of the contract's shape. */
function checkTurn(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('turnFinished takes { sessionId, turnId, outcome, title, body }')
  for (const key of ['sessionId', 'turnId'])
    if (typeof input[key] !== 'string' || input[key] === '' || input[key].length > MAX_ID)
      throw new TypeError(`${key} must be a non-empty string`)
  if (!OUTCOMES.includes(input.outcome)) throw new TypeError('outcome is not one of the four')
  for (const key of ['title', 'body'])
    if (typeof input[key] !== 'string') throw new TypeError(`${key} must be a string`)
}

/**
 * @param {object} deps
 * @param {{ handle: Function, removeHandler: Function }} deps.ipcMain
 * @param {string} deps.origin - the pinned origin.
 * @param {typeof import('electron').Notification} deps.Notification
 * @param {() => import('electron').BrowserWindow[]} deps.windows - every app window (focus check).
 * @param {{ read: () => { notifications: { enabled: boolean } }, update: Function }} deps.prefs
 * @param {string} deps.platform - `process.platform`.
 * @param {(url: string) => unknown} deps.openExternal
 * @param {(command: string) => boolean} [deps.hasCommand] - whether `command` is on this computer (Linux).
 * @param {(command: string, args: readonly string[]) => unknown} [deps.spawnDetached] - run it, fire and forget (Linux).
 * @param {() => number} [deps.now]
 * @param {{ read: () => Promise<unknown> }} [deps.permission] - the macOS permission reader
 *   (src/notify-permission.js); its answer is mapped to `allowed | denied | unknown` here.
 * @param {(line: string) => void} [deps.log]
 */
function createNotifyBridge({
  ipcMain,
  origin,
  Notification,
  windows,
  prefs,
  platform,
  openExternal,
  hasCommand = commandOnPath,
  spawnDetached = spawnAndForget,
  now = Date.now,
  permission: reader = { read: async () => 'unknown' },
  log = () => {}
}) {
  /** Where "Open System Settings" goes on this computer, or null: the page hides the button then. */
  const settingsTarget = () => {
    if (Object.hasOwn(SYSTEM_SETTINGS, platform)) return { url: SYSTEM_SETTINGS[platform] }
    if (platform === 'linux' && hasCommand(LINUX_SETTINGS.command)) return { command: LINUX_SETTINGS }
    return null
  }
  /** Turns already decided, oldest first. */
  const decided = new Set()
  /** Notifications on screen, held until the system closes them. */
  const held = new Set()
  let lastShownAt = null
  let lastTestAt = Number.NEGATIVE_INFINITY

  const supported = () => {
    try {
      return Notification.isSupported() === true
    } catch {
      return false
    }
  }
  /** The permission last read: `allowed | denied | unknown`. */
  let permission = 'unknown'
  /** Read the permission again; true when it changed. Never throws. */
  const readPermission = async () => {
    if (platform !== 'darwin') return false
    let next = 'unknown'
    try {
      const answer = await reader.read()
      if (answer === 'allowed' || answer === 'denied') next = answer
    } catch {
      // A failed read is not an answer: unknown.
    }
    if (next === permission) return false
    log(`notify bridge: permission ${permission} → ${next}`)
    permission = next
    return true
  }

  const status = () => {
    const { enabled, sound } = prefs.read().notifications
    return {
      supported: supported(),
      enabled,
      sound,
      permission,
      lastShownAt,
      settingsTarget: settingsTarget() !== null
    }
  }

  /** The `sound` option to pass, if any: a chosen sound, on macOS only. */
  const soundOption = () => {
    const { sound } = prefs.read().notifications
    return platform === 'darwin' && sound !== DEFAULT_SOUND ? { sound } : {}
  }

  const live = (window) => window != null && !window.isDestroyed()

  const bringBack = (sender) => {
    const window = live(sender) ? sender : (bridge.productWindows()[0] ?? windows().find(live))
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  const show = ({ title, body }, sender) => {
    const notification = new Notification({ title, body, ...soundOption() })
    held.add(notification)
    const release = () => held.delete(notification)
    notification.on('close', release)
    notification.on('failed', release)
    notification.on('click', () => bringBack(sender))
    notification.show()
    lastShownAt = now()
  }

  /** Records `key` as decided; false when it already was. */
  const firstTime = (key) => {
    if (decided.has(key)) return false
    decided.add(key)
    if (decided.size > REMEMBERED_TURNS) decided.delete(decided.values().next().value)
    return true
  }

  const turnFinished = (input, sender) => {
    checkTurn(input)
    if (!firstTime(JSON.stringify([origin, input.sessionId, input.turnId]))) return 'duplicate'
    if (!prefs.read().notifications.enabled) return 'off'
    if (!supported()) return 'unsupported'
    if (windows().some((window) => live(window) && window.isFocused())) return 'suppressed-focus'
    if (lastShownAt !== null && now() - lastShownAt < GAP_MS) return 'rate-limited'
    show(
      { title: cut(input.title, MAX_TITLE) || TEST_NOTIFICATION.title, body: cut(input.body, MAX_BODY) },
      sender
    )
    return 'shown'
  }

  const bridge = createProductBridge({
    ipcMain,
    origin,
    label: 'notify bridge',
    log,
    handlers: {
      [NOTIFY_CHANNELS.status]: async () => {
        await readPermission()
        return status()
      },
      [NOTIFY_CHANNELS.setEnabled]: async (on) => {
        if (typeof on !== 'boolean') throw new TypeError('enabled must be a boolean')
        await prefs.update({ notifications: { enabled: on } })
        return status()
      },
      [NOTIFY_CHANNELS.setSound]: async (name) => {
        if (!isNotifySound(name)) throw new TypeError('sound must be system or a listed sound name')
        await prefs.update({ notifications: { sound: name } })
        return status()
      },
      [NOTIFY_CHANNELS.test]: (_arg, sender) => {
        if (supported() && now() - lastTestAt >= GAP_MS) {
          lastTestAt = now()
          show(TEST_NOTIFICATION, sender)
        }
        return status()
      },
      [NOTIFY_CHANNELS.turnFinished]: (input, sender) => {
        const decision = turnFinished(input, sender)
        log(`notify bridge: turn ${input.outcome} → ${decision}`)
        return { decision }
      },
      [NOTIFY_CHANNELS.openSettings]: () => {
        const target = settingsTarget()
        if (target === null) return undefined
        if ('url' in target) void Promise.resolve(openExternal(target.url)).catch(() => {})
        else {
          try {
            spawnDetached(target.command.command, target.command.args)
          } catch {
            // Nothing to tell the page: the button is only shown when the command was there.
          }
        }
        return undefined
      }
    }
  })

  return {
    attach: bridge.attach,
    /**
     * Read the permission again (a product window gained focus); when it changed, push the status to
     * every product page showing the pinned origin.
     */
    async refresh() {
      if (!(await readPermission())) return
      const current = status()
      for (const window of bridge.productWindows()) window.webContents.send(NOTIFY_CHANNELS.changed, current)
    },
    /** How many shown notifications are still held (tests). */
    heldCount: () => held.size,
    dispose() {
      bridge.dispose()
      held.clear()
      decided.clear()
    }
  }
}

/** Whether `command` is an executable file in one of PATH's directories. */
function commandOnPath(command) {
  const dirs = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
  for (const dir of dirs) {
    try {
      fs.accessSync(path.join(dir, command), fs.constants.X_OK)
      return true
    } catch {
      // next directory
    }
  }
  return false
}

/** Start `command` detached from the app, output ignored, and let it live on its own. */
function spawnAndForget(command, args) {
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
}

module.exports = { createNotifyBridge }
