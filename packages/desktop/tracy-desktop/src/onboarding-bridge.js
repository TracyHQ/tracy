/**
 * The onboarding bridge: `window.tracyDesktop.app.onboarding` (shell/preload.ts). The first-run
 * screen asks `get()` whether this device already closed it, and `close({ outcome, picked })` when
 * the person finishes or skips it. Kept per device in `<userData>/preferences.json`
 * (src/preferences.js, part `onboarding`), never on the server. Channels in src/update-channels.js.
 *
 * `close` takes `outcome` ('completed' | 'dismissed') and `picked` (an agent id or null) and nothing
 * else; the time is the main process's own. With `again` (TRACY_DESKTOP_ONBOARDING=again, a run from
 * source only — src/debug-switches.js) `get()` answers "not closed" until the screen is closed in
 * this run, and writes nothing for it. Who may ask: src/bridge-guard.js. `openOnboarding()` is the
 * one push: the app menu's Help › Getting started asks the page to show the screen again.
 */
const { createProductBridge } = require('./bridge-guard.js')
const { AGENT_ID } = require('./agent-manifest.js')
const { DEFAULT_ONBOARDING } = require('./preferences.js')
const { ONBOARDING_CHANNELS } = require('./update-channels.js')

const OUTCOMES = Object.freeze(['completed', 'dismissed'])

/** Throws a TypeError unless `input` is exactly `{ outcome, picked }` of the right shapes. */
function checkClose(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('close takes { outcome, picked }')
  const keys = Object.keys(input).sort()
  if (keys.length !== 2 || keys[0] !== 'outcome' || keys[1] !== 'picked')
    throw new TypeError('close takes { outcome, picked } and nothing else')
  if (!OUTCOMES.includes(input.outcome)) throw new TypeError('outcome must be completed or dismissed')
  const { picked } = input
  if (picked !== null && (typeof picked !== 'string' || picked.length > 64 || !AGENT_ID.test(picked)))
    throw new TypeError('picked must be an agent id or null')
}

/**
 * @param {object} deps
 * @param {{ handle: Function, removeHandler: Function }} deps.ipcMain
 * @param {string} deps.origin - the pinned origin.
 * @param {ReturnType<typeof import('./preferences.js').createPreferences>} deps.prefs
 * @param {boolean} [deps.again] - show the screen again this run (TRACY_DESKTOP_ONBOARDING=again).
 * @param {() => number} [deps.now]
 * @param {(line: string) => void} [deps.log]
 */
function createOnboardingBridge({ ipcMain, origin, prefs, again = false, now = Date.now, log = () => {} }) {
  let showAgain = again
  const bridge = createProductBridge({
    ipcMain,
    origin,
    label: 'onboarding bridge',
    log,
    handlers: {
      [ONBOARDING_CHANNELS.get]: () => {
        const saved = prefs.read().onboarding
        return showAgain ? { ...DEFAULT_ONBOARDING, picked: saved.picked } : saved
      },
      [ONBOARDING_CHANNELS.close]: async (input) => {
        checkClose(input)
        const saved = await prefs.update({
          onboarding: {
            flowVersion: DEFAULT_ONBOARDING.flowVersion,
            closedAt: now(),
            outcome: input.outcome,
            picked: input.picked
          }
        })
        showAgain = false
        log(`onboarding bridge: first-run screen closed (${input.outcome})`)
        return saved.onboarding
      }
    }
  })
  return {
    attach: bridge.attach,
    /**
     * Whether this is a first run: the screen was never closed on this device (or, with `again`,
     * not yet in this run). The sign-in page is then asked for with `onboard=1` (src/signin-doors.js).
     */
    firstRun: () => showAgain || prefs.read().onboarding.closedAt === null,
    /**
     * Help › Getting started: tell a product window's page to open the first-run screen — the one in
     * front, or else the first one, brought forward. Only windows whose top frame shows the pinned
     * origin are told. False when there is none.
     */
    openOnboarding() {
      const windows = bridge.productWindows()
      const window = windows.find((candidate) => candidate.isFocused()) ?? windows[0]
      if (window === undefined) return false
      if (!window.isFocused()) {
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
      }
      window.webContents.send(ONBOARDING_CHANNELS.open)
      log('onboarding bridge: Help › Getting started sent to the page')
      return true
    },
    dispose: bridge.dispose
  }
}

module.exports = { createOnboardingBridge }
