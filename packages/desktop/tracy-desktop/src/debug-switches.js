/**
 * A PACKAGED app refuses Chromium's remote-debugging switches. With `--remote-debugging-port` (or
 * `-pipe`, or `-address`) any local process could start the signed, notarized app with a debug port
 * and drive it — pages, cookies, the person's session. No Electron fuse covers these switches (the
 * fuses in build/fuses.mjs stop RunAsNode, NODE_OPTIONS and --inspect), so main.js checks them as the
 * very first thing it does and exits.
 *
 * Source runs keep them: `pnpm debug` starts Electron with `--remote-debugging-port=0` for agents.
 *
 * TEST ONLY: `TRACY_DESKTOP_ALLOW_CDP=1` lets a packaged build that is NOT on the stable channel (a dev
 * build, a test-name or Preview build with no channel) take them, so a packaged copy can be driven and
 * captured over CDP — the changelog's screenshots and clips are taken from a real build that way
 * (docs/references/phat-hanh-app-desktop.md §6.1). The stable channel ignores it and says so: the
 * app people install keeps refusing whatever its environment holds.
 */

const REFUSED = Object.freeze(['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address'])

/** Exit code of a refused launch (secondLaunch in dev-profile.js uses 3). */
const REFUSED_EXIT_CODE = 4

/**
 * The refused switch this launch carries, or null. Reads both Chromium's own view (`hasSwitch`) and the
 * raw argv in any spelling Chromium or a person might use: `--x`, `-x`, `--x=value`, `--x value`, any case,
 * `_` for `-`.
 * @param {{ packaged: boolean, argv: string[], hasSwitch: (name: string) => boolean }} launch
 * @returns {string | null}
 */
function refusedDebugSwitch({ packaged, argv, hasSwitch }) {
  if (!packaged) return null
  for (const name of REFUSED) if (hasSwitch(name)) return name
  for (const arg of argv.slice(1)) {
    const m = /^--?([A-Za-z_-]+)(?:=.*)?$/s.exec(arg)
    if (!m) continue
    const name = m[1].toLowerCase().replace(/_/g, '-')
    if (REFUSED.includes(name)) return name
  }
  return null
}

/**
 * What a launch's debug switches come to: the refused one (null when the launch may go on) and a line
 * to log about `TRACY_DESKTOP_ALLOW_CDP` (null when it played no part).
 * @param {{ packaged: boolean, argv: string[], hasSwitch: (name: string) => boolean,
 *   channel: string | undefined, env: Record<string, string | undefined> }} launch
 *   `channel`: the bundle's `update-channel` (undefined for a build without one).
 * @returns {{ refused: string | null, note: string | null }}
 */
function debugSwitchVerdict({ packaged, argv, hasSwitch, channel, env }) {
  const refused = refusedDebugSwitch({ packaged, argv, hasSwitch })
  if (refused === null || env.TRACY_DESKTOP_ALLOW_CDP !== '1') return { refused, note: null }
  if (channel === 'stable') return { refused, note: 'TRACY_DESKTOP_ALLOW_CDP ignored on the stable channel' }
  return {
    refused: null,
    note: `TRACY_DESKTOP_ALLOW_CDP=1: remote debugging allowed on this ${channel ?? 'test'} build (--${refused})`
  }
}

/** The bundle's `update-channel` (build/package.sh writes it next to `src/`), or undefined. */
function pinnedChannel() {
  try {
    const value = require('node:fs')
      .readFileSync(require('node:path').join(__dirname, '..', 'update-channel'), 'utf8')
      .trim()
    return value === '' ? undefined : value
  } catch {
    return undefined
  }
}

/**
 * Exit at once when a packaged launch carries a refused switch: one line on stderr, a non-zero code,
 * before any window, session or other module of the app exists.
 * @param {import('electron').App} app
 */
function refuseDebugSwitches(app) {
  const { refused: name, note } = debugSwitchVerdict({
    packaged: app.isPackaged,
    argv: process.argv,
    hasSwitch: (s) => app.commandLine.hasSwitch(s),
    channel: app.isPackaged ? pinnedChannel() : undefined,
    env: process.env
  })
  if (note !== null) process.stderr.write(`tracy-desktop: ${note}\n`)
  if (name === null) return
  process.stderr.write(
    `tracy-desktop: --${name} is refused in a packaged app; it would let another process drive it\n`
  )
  process.exit(REFUSED_EXIT_CODE)
}

/**
 * TEST ONLY: `TRACY_DESKTOP_ONBOARDING=again` makes the first-run screen show again for this run
 * (src/onboarding-bridge.js answers "not closed yet" and writes nothing), so an E2E run can drive it
 * on a profile that already closed it. A run from source only: a packaged app ignores it, as it
 * ignores every other debug switch.
 * @param {{ packaged: boolean, env: Record<string, string | undefined> }} launch
 */
function onboardingAgain({ packaged, env }) {
  return !packaged && env.TRACY_DESKTOP_ONBOARDING === 'again'
}

/** The shortest check interval a test run may ask for: a minute, so no build can hammer the feed. */
const MIN_TEST_INTERVAL_MS = 60_000
/** The longest: the real interval (src/update-plan.js CHECK_INTERVAL_MS); a test only shortens it. */
const MAX_TEST_INTERVAL_MS = 4 * 60 * 60 * 1000
/** The longest reminder wait a test may ask for: the real one (src/update-plan.js REMIND_AFTER_MS). */
const MAX_TEST_REMIND_MS = 3 * 24 * 60 * 60 * 1000
/** One heartbeat line a minute while TRACY_DESKTOP_UPDATE_HEARTBEAT=1. */
const HEARTBEAT_MS = 60_000

/**
 * TEST ONLY: the self-update switches a measurement run of a PACKAGED app needs (the updater runs only
 * in a packaged app, so unlike the switches above these are read there too):
 *
 *   TRACY_DESKTOP_UPDATE_INTERVAL_MS=<ms>   the base interval between automatic checks, instead of 4 h
 *                                           (60 000 ms to 4 h; anything else is ignored and said so)
 *   TRACY_DESKTOP_UPDATE_HEARTBEAT=1        one line a minute in updater.log, with how late it ran
 *   TRACY_DESKTOP_UPDATE_REMIND_MS=<ms>     the "Restart to update" reminder comes this long after a
 *                                           version is ready and repeats this often, instead of 3 days
 *                                           and a day (60 000 ms to 3 days; tasks/todo-desktop-update-
 *                                           policy.md S-A7). The interval above also shortens the 24-hour
 *                                           minimum version re-check (src/main.js).
 *   TRACY_DESKTOP_NOTIFY_LOG=<absolute file> the shell's own notifications (reminder, What's new, the
 *                                           minimum version warning) are appended there as JSON lines
 *                                           instead of shown, and pressed at once — so a run with no one
 *                                           at the screen exercises the press (it opens Help & about)
 *                                           and no notification permission is ever asked for.
 *   TRACY_DESKTOP_TEST_BLOCKED_PRESS=update,retry,download  the blocked screen's buttons pressed in
 *                                           this order, one each time the screen is idle and offers
 *                                           it (as TRACY_DESKTOP_UPDATE_ANSWER answers the dialogs) —
 *                                           through the same function the page's press reaches.
 *
 * Read only on a build whose channel is not `stable`: a stable copy keeps its 4-hour schedule and its
 * quiet log whatever its environment holds. Unset (always, outside such a run): no change at all.
 * @param {{ channel: string, env: Record<string, string | undefined> }} launch
 * @returns {{ intervalMs: number | null, heartbeatMs: number | null, remindMs: number | null, notifyLog: string | null, blockedPress: string[] | null, ignored: string[] }} `ignored`:
 *   one line per switch that was set but not taken, for the log.
 */
function updateTestSwitches({ channel, env }) {
  const result = {
    intervalMs: null,
    heartbeatMs: null,
    remindMs: null,
    notifyLog: null,
    blockedPress: null,
    ignored: []
  }
  const blockedPress = env.TRACY_DESKTOP_TEST_BLOCKED_PRESS
  const notifyLog = env.TRACY_DESKTOP_NOTIFY_LOG
  const interval = env.TRACY_DESKTOP_UPDATE_INTERVAL_MS
  const heartbeat = env.TRACY_DESKTOP_UPDATE_HEARTBEAT
  const remind = env.TRACY_DESKTOP_UPDATE_REMIND_MS
  if (channel === 'stable') {
    if (remind !== undefined) result.ignored.push('TRACY_DESKTOP_UPDATE_REMIND_MS: not on the stable channel')
    if (notifyLog !== undefined) result.ignored.push('TRACY_DESKTOP_NOTIFY_LOG: not on the stable channel')
    if (blockedPress !== undefined)
      result.ignored.push('TRACY_DESKTOP_TEST_BLOCKED_PRESS: not on the stable channel')
    if (interval !== undefined)
      result.ignored.push('TRACY_DESKTOP_UPDATE_INTERVAL_MS: not on the stable channel')
    if (heartbeat !== undefined)
      result.ignored.push('TRACY_DESKTOP_UPDATE_HEARTBEAT: not on the stable channel')
    return result
  }
  if (interval !== undefined) {
    const ms = /^\d+$/.test(interval) ? Number(interval) : Number.NaN
    if (ms >= MIN_TEST_INTERVAL_MS && ms <= MAX_TEST_INTERVAL_MS) result.intervalMs = ms
    else
      result.ignored.push(
        `TRACY_DESKTOP_UPDATE_INTERVAL_MS: must be whole milliseconds from ${MIN_TEST_INTERVAL_MS} to ${MAX_TEST_INTERVAL_MS}`
      )
  }
  if (remind !== undefined) {
    const ms = /^\d+$/.test(remind) ? Number(remind) : Number.NaN
    if (ms >= MIN_TEST_INTERVAL_MS && ms <= MAX_TEST_REMIND_MS) result.remindMs = ms
    else
      result.ignored.push(
        `TRACY_DESKTOP_UPDATE_REMIND_MS: must be whole milliseconds from ${MIN_TEST_INTERVAL_MS} to ${MAX_TEST_REMIND_MS}`
      )
  }
  if (notifyLog !== undefined) {
    if (notifyLog.startsWith('/')) result.notifyLog = notifyLog
    else result.ignored.push('TRACY_DESKTOP_NOTIFY_LOG: must be an absolute file path')
  }
  if (blockedPress !== undefined) {
    const presses = blockedPress.split(',').filter(Boolean)
    if (presses.length > 0 && presses.every((p) => ['update', 'retry', 'download'].includes(p)))
      result.blockedPress = presses
    else result.ignored.push('TRACY_DESKTOP_TEST_BLOCKED_PRESS: a comma list of update, retry, download')
  }
  if (heartbeat === '1') result.heartbeatMs = HEARTBEAT_MS
  else if (heartbeat !== undefined) result.ignored.push('TRACY_DESKTOP_UPDATE_HEARTBEAT: only 1 turns it on')
  return result
}

/**
 * A heartbeat of the main process: every `everyMs`, one log line with how late the beat ran. A beat
 * that comes minutes late (or none at all) means the main process could not run its timers in that
 * time — a modal loop, a suspended machine — while an updater timer that also came late is not the
 * updater's own fault. A chain of single timers, not an interval, so each beat measures its own delay.
 * @param {{ everyMs: number, timers: { setTimeout: Function, clearTimeout: Function }, now: () => number,
 *   log: (line: string) => void, pid: number }} deps
 * @returns {() => void} stops the heartbeat.
 */
function createHeartbeat({ everyMs, timers, now, log, pid }) {
  let beat = 0
  let due = now() + everyMs
  let timer = null
  const next = () => {
    timer = timers.setTimeout(() => {
      beat++
      const at = now()
      log(`heartbeat ${beat}: pid ${pid}, ${at - due} ms late`)
      due = at + everyMs
      next()
    }, everyMs)
  }
  next()
  return () => {
    if (timer) timers.clearTimeout(timer)
    timer = null
  }
}

module.exports = {
  refusedDebugSwitch,
  debugSwitchVerdict,
  refuseDebugSwitches,
  onboardingAgain,
  updateTestSwitches,
  createHeartbeat,
  REFUSED_EXIT_CODE
}
