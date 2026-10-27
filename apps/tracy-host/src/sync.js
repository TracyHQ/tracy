/**
 * The two clocks that used to be `tracy-site-sync.timer` and `tracy-brands-sync.timer` on the
 * fleet host — every site's folder pushed to its team repo once an hour
 * (`tools/sync-site-folders.sh`), every site's extracted brand published to the public shelf every
 * ten minutes (`tools/sync-brands.sh`) — and a third that never had a timer: once a day, the table
 * snapshots `db.snapshot` left in every copy's own database that have outlived their use are dropped
 * (`tools/sweep-copy-snapshots.sh`, #1649; the rule is `lib/copy_snapshots.py`'s, and every backup a
 * site makes runs the same sweep, so this clock is for the copies nobody backs up). That one never
 * leaves the host and asks no token. The first two scripts source `lib/roots.sh` for
 * `TRACY_SITES_ROOT`/`TRACY_PRIVATE_ROOT` and ask `tracy-web`'s `/fleet/git-token` for a push token
 * through `lib/relay-git-token.sh`, signed with this host's own `HOST_SECRET` and `HOST_NAME` from
 * the environment this process passes down. This module only starts the clocks; it never touches
 * that channel itself.
 *
 * 🔒 `server.js` STARTS THEM (unless `TRACY_HOST_SYNC=0`). Until 02/10/2026 nothing did: `start()`
 * existed and no caller imported it, the systemd timers were gone with the move into a container,
 * and 58 of 58 site repos on dev still held only GitHub's `Initial commit`.
 *
 * FIRST RUN ~5 MINUTES AFTER BOOT, not one interval after it. The dev machine is redeployed several
 * times a day; a plain one-hour `setInterval` restarted with every deploy would never reach its
 * first tick. Five minutes lets the boot-time work (`mtimes.js`, `content-identity.js`) and the
 * sites' own containers settle first. Each clock's interval starts at its first run.
 *
 * NEVER TWO RUNS OF ONE SCRIPT AT ONCE. A tick that finds the previous run of the same script still
 * going is skipped and logged — the scripts' own `flock` would make it wait instead, and a queue of
 * waiting runs behind one hung push is the failure this avoids. And no run is allowed to hang
 * forever: each has a time limit (`run.js`'s `timeoutMs`, which kills the whole process group),
 * shorter than its interval so a stuck run costs at most one skipped tick.
 *
 * `run` is always the caller's, same injection as every other module here (`provision.js`,
 * `webroot.js`) — this file never imports `run.js` directly, so a test never spawns a real
 * process. The timer functions are injected too, for the same reason: a test that actually waited
 * five minutes and then an hour to see a tick would be a test nobody could run.
 */
import path from 'node:path'

export const FIRST_RUN_DELAY_MS = 5 * 60 * 1000 // five minutes after boot
export const SITE_FOLDERS_INTERVAL_MS = 60 * 60 * 1000 // one hour
export const BRANDS_INTERVAL_MS = 10 * 60 * 1000 // ten minutes
// Snapshots are kept for days (TRACY_SNAP_KEEP_DAYS, 7): once a day is plenty, and every deploy
// adds a run five minutes after boot.
export const COPY_SNAPSHOTS_INTERVAL_MS = 24 * 60 * 60 * 1000 // one day
// Under the interval, so a hung run is killed before the next tick would have to be skipped.
export const SITE_FOLDERS_TIMEOUT_MS = 50 * 60 * 1000
// Longer than the ten-minute interval on purpose: the very first run clones the whole shelf, and
// the ticks it overlaps are skipped, not queued.
export const BRANDS_TIMEOUT_MS = 30 * 60 * 1000
// A query per site and a DROP per expired tag; an hour is far past any honest run.
export const COPY_SNAPSHOTS_TIMEOUT_MS = 60 * 60 * 1000

/** Run `tools/sync-site-folders.sh` once — every site's folder pushed to its team repo. */
export async function syncSiteFolders({ config, run, timeoutMs = SITE_FOLDERS_TIMEOUT_MS }) {
  return run({
    script: 'bash',
    args: [path.join(config.scriptsDir, 'tools', 'sync-site-folders.sh')],
    env: { ...process.env },
    logPath: path.join(config.logDir, 'sync-site-folders.log'),
    timeoutMs
  })
}

/** Run `tools/sync-brands.sh` once — every `Brand/<host>/` on this host published to the shelf. */
export async function syncBrands({ config, run, timeoutMs = BRANDS_TIMEOUT_MS }) {
  return run({
    script: 'bash',
    args: [path.join(config.scriptsDir, 'tools', 'sync-brands.sh')],
    env: { ...process.env },
    logPath: path.join(config.logDir, 'sync-brands.log'),
    timeoutMs
  })
}

/** Run `tools/sweep-copy-snapshots.sh` once — every copy's expired table snapshots dropped. */
export async function sweepCopySnapshots({ config, run, timeoutMs = COPY_SNAPSHOTS_TIMEOUT_MS }) {
  return run({
    script: 'bash',
    args: [path.join(config.scriptsDir, 'tools', 'sweep-copy-snapshots.sh')],
    env: { ...process.env },
    logPath: path.join(config.logDir, 'sweep-copy-snapshots.log'),
    timeoutMs
  })
}

/**
 * Start the three clocks. A failing run is logged and never thrown out of the timer callback — a sync
 * script that fails once (a transient git push conflict, a network blip) must not take the next
 * hour's or the next ten minutes' attempt down with it, and there is no caller left waiting on a
 * timer tick to hand an exception to.
 *
 * @param {object} input
 * @param {object} input.config - needs `scriptsDir`, `logDir`.
 * @param {Function} input.run - `run.js`'s `runScript` (or a test fake with the same shape).
 * @param {object} [input.log]
 * @param {number} [input.firstRunDelayMs]
 * @param {typeof setTimeout} [input.setTimeoutFn]
 * @param {typeof clearTimeout} [input.clearTimeoutFn]
 * @param {typeof setInterval} [input.setIntervalFn]
 * @param {typeof clearInterval} [input.clearIntervalFn]
 * @returns {{stop: () => void, ticks: {siteFolders: () => Promise<void>, brands: () => Promise<void>, copySnapshots: () => Promise<void>}}}
 *   `stop` clears every timer — `server.js`'s `close()` and the tests call it; a run already in
 *   flight is left to finish (or hit its time limit). `ticks` are the timer callbacks, for tests.
 */
export function start({
  config,
  run,
  log = console,
  firstRunDelayMs = FIRST_RUN_DELAY_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
}) {
  const timers = []
  let stopped = false

  const clock = (name, fn, intervalMs) => {
    let running = false
    const tick = async () => {
      if (running) {
        log.warn?.(`[sync] ${name}: the previous run is still going — this tick is skipped`)
        return
      }
      running = true
      try {
        const { code, tail } = await fn({ config, run })
        if (code !== 0) log.error(`[sync] ${name} exited ${code}: ${tail.join('\n')}`)
      } catch (error) {
        log.error(`[sync] ${name} threw: ${error?.message ?? error}`)
      } finally {
        running = false
      }
    }
    const first = setTimeoutFn(() => {
      if (stopped) return
      // Node's own timer objects keep the event loop alive; unref() lets a process (or a test)
      // that has nothing else to do exit without an explicit stop() first.
      const every = setIntervalFn(tick, intervalMs)
      every?.unref?.()
      timers.push({ handle: every, clear: clearIntervalFn })
      tick()
    }, firstRunDelayMs)
    first?.unref?.()
    timers.push({ handle: first, clear: clearTimeoutFn })
    return tick
  }

  const siteFolders = clock('sync-site-folders', syncSiteFolders, SITE_FOLDERS_INTERVAL_MS)
  const brands = clock('sync-brands', syncBrands, BRANDS_INTERVAL_MS)
  const copySnapshots = clock('sweep-copy-snapshots', sweepCopySnapshots, COPY_SNAPSHOTS_INTERVAL_MS)

  return {
    stop() {
      stopped = true
      for (const { handle, clear } of timers) clear(handle)
    },
    ticks: { siteFolders, brands, copySnapshots }
  }
}
