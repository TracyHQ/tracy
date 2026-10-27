/**
 * The app updates itself — the Electron half (`src/update-plan.js` is the pure half).
 *
 * A trimmed `AppUpdaterService` of Cherry Studio (tasks/todo-desktop-auto-update.md): electron-updater
 * reads the channel file of its platform (`<channel>-mac.yml`, `<channel>.yml` on Windows,
 * `<channel>-linux[-arm64].yml`) through the signed provider (src/signed-feed-provider.js), so nothing
 * unsigned is ever offered, and downloads the update in the background (zip, NSIS installer, AppImage).
 *
 * WHEN IT INSTALLS (tasks/todo-desktop-update-policy.md A1): on a Mac signed with a certificate and an
 * AppImage, ON QUIT, with no question (`autoInstallOnAppQuit`) — the newest version that is verified
 * AND prepared: on a Mac, the one Squirrel.Mac itself said it prepared (`stagedVersion`), not merely
 * the one electron-updater downloaded (MacUpdater emits `update-downloaded` before Squirrel starts).
 * Windows (NSIS) keeps the "ready to install" question and Restart until a Windows shutdown/logoff run
 * proves install on quit safe there (6.8.9 lacks the shutdown guard of 7.x). "Restart to update"
 * installs now everywhere. No question opens by itself on a Mac or an AppImage: a free-floating dialog
 * stops the main process's timers (tasks/evidence/desktop-update-policy/dialog-timer/CONCLUSION.md),
 * and where the dialog goes is src/main.js's rule (a sheet on a window, or no dialog).
 *
 * A version ready for REMIND_AFTER_MS brings a reminder (`deps.remind`, a system notification), at
 * most one per REMIND_EVERY_MS, from this one main process.
 *
 * Everything Electron-shaped comes in through `startUpdater`'s arguments (the updater, the clock,
 * the question asked, the browser), so test/updater.test.mjs drives it without Electron.
 */
const fs = require('node:fs')
const path = require('node:path')
const {
  CHECK_INTERVAL_MS,
  INITIAL_CHECK_DELAY_MS,
  REMIND_AFTER_MS,
  REMIND_EVERY_MS,
  compareVersions,
  nextCheckDelay,
  reminderDue,
  updateHeaders
} = require('./update-plan.js')
const { initialUpdateState, reduceUpdate } = require('./update-state.js')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The install id: the UUID electron-updater generated on its first check and keeps in
 * `<userData>/.updaterId`, the same one it sends as `x-user-staging-id`. Read, never made here —
 * a second id would be a second machine in tracy-web's `desktop_install`.
 * @param {string} userDataDir
 * @returns {string | null}
 */
function readInstallId(userDataDir) {
  try {
    const value = fs.readFileSync(path.join(userDataDir, '.updaterId'), 'utf8').trim()
    return UUID.test(value) ? value.toLowerCase() : null
  } catch {
    return null
  }
}

/** What `X.Y.Z` or `X.Y.Z-pre.N` looks like; anything else is not used to build an address. */
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/

/**
 * Is `url` an address on the feed itself? Same origin as the feed, no credentials, and https — or
 * plain http only when the feed itself is a loopback test feed.
 * @param {URL} url
 * @param {URL} feed
 */
function onFeed(url, feed) {
  if (url.username !== '' || url.password !== '') return false
  if (url.origin !== feed.origin) return false
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && LOOPBACK.has(feed.hostname)
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/**
 * The install file a person downloads, per platform, for `<variant>-<version>`: the names
 * build/release-feed.mjs `artifactName` gives them. macOS takes the universal dmg first (one file for
 * either chip), then this arch's.
 * @param {{ platform: string, variant: string, version: string, arch: string }} input
 * @returns {string[]} file names, most wanted first.
 */
function installFiles({ platform, variant, version, arch }) {
  if (platform === 'win32') return [`${variant}-${version}-win-${arch}-setup.exe`]
  if (platform === 'linux') return [`${variant}-${version}-linux-${arch}.deb`]
  return [`${variant}-${version}-universal.dmg`, `${variant}-${version}-${arch}.dmg`]
}

/**
 * The download address of a version, for a copy that cannot install in place (an ad-hoc signed Mac,
 * a Linux .deb): the install file the channel file lists for this platform and arch — it sits in its
 * release folder (`<channel>/<version>/<build id>/`), so the URL is read from `files`, resolved
 * against the feed. A channel file listing none falls back to this arch's flat name next to it.
 *
 * 🔒 THE ANSWER GOES TO `shell.openExternal`, SO NOTHING FROM THE FEED PASSES UNCHECKED (council
 * 09/10): the address must stay on the feed's own origin (https, no credentials), be one of this
 * platform's install files for this arch and carry this version's name; the version must look like a
 * version. Otherwise null.
 * @param {{ feedUrl: string, channel: string, version: string, arch: string, platform?: string, files?: { url: string }[] }} input
 * @returns {string | null}
 */
function downloadUrl({ feedUrl, channel, version, arch, platform = 'darwin', files }) {
  if (typeof version !== 'string' || !VERSION.test(version)) return null
  let feed
  try {
    feed = new URL(`${feedUrl.replace(/\/+$/, '')}/`)
  } catch {
    return null
  }
  if (!onFeed(feed, feed)) return null
  const variant = channel === 'dev' ? 'Tracy-Cowork-Dev' : 'Tracy-Cowork'
  const wanted = installFiles({ platform, variant, version, arch })
  for (const name of wanted) {
    for (const file of Array.isArray(files) ? files : []) {
      if (typeof file?.url !== 'string') continue
      let url
      try {
        url = new URL(file.url, feed)
      } catch {
        continue
      }
      if (onFeed(url, feed) && url.pathname.endsWith(`/${name}`) && url.search === '' && url.hash === '')
        return url.href
    }
  }
  return new URL(wanted.at(-1), feed).href
}

/**
 * @typedef {{ kind: 'downloaded' | 'downloading' | 'available' | 'current' | 'failed', version?: string, reason?: string }} Question
 * @typedef {'restart' | 'download' | 'later' | 'ok'} Answer
 * @typedef {import('./update-state.js').UpdateState} UpdateState
 *
 * @param {object} deps
 * @param {import('electron-updater').AppUpdater} deps.autoUpdater
 * @param {'stable' | 'dev'} deps.channel
 * @param {string} deps.feedUrl - the feed from `app-update.yml`.
 * @param {Function} deps.feedProvider - src/signed-feed-provider.js's class: the ONLY way the feed is
 *   read, so no channel file reaches electron-updater unless its signature verifies.
 * @param {string} deps.platform - `process.platform`: which install file a download link names.
 * @param {string} deps.version - the running version.
 * @param {string} deps.arch
 * @param {string} deps.osVersion
 * @param {boolean} deps.inPlace - this copy can replace itself (src/update-plan.js `selfUpdateMode`).
 * @param {{ setTimeout: Function, clearTimeout: Function }} deps.timers
 * @param {() => number} deps.random
 * @param {(question: Question) => Promise<Answer>} deps.ask - a native dialog in the app.
 * @param {(url: string) => void} deps.openExternal
 * @param {(line: string) => void} deps.log
 * @param {{ read: () => { autoCheck: boolean }, write: (p: { autoCheck: boolean }) => Promise<void> }} [deps.prefs]
 *   - `src/preferences.js`; absent = automatic checks on, nothing saved.
 * @param {() => number} [deps.now] - the clock for `lastCheckedAt` / `nextRetryAt` and the timer log.
 * @param {number} [deps.intervalMs] - the base interval between checks; CHECK_INTERVAL_MS unless a test
 *   run shortens it (src/debug-switches.js `updateTestSwitches`).
 * @param {(version: string) => void} [deps.remind] - the "Restart to update" reminder (a notification).
 * @param {number} [deps.remindAfterMs] - REMIND_AFTER_MS unless a test run shortens it.
 * @param {number} [deps.remindEveryMs] - REMIND_EVERY_MS unless a test run shortens it.
 */
function startUpdater(deps) {
  const { autoUpdater: updater, channel, timers, log } = deps
  const now = deps.now ?? Date.now
  const intervalMs = deps.intervalMs ?? CHECK_INTERVAL_MS
  if (typeof deps.feedProvider !== 'function')
    throw new Error('the updater needs the signed feed provider; without it any feed would be trusted')
  const prefs = deps.prefs ?? { read: () => ({ autoCheck: true }), write: async () => {} }

  updater.requestHeaders = {
    ...updater.requestHeaders,
    ...updateHeaders({ version: deps.version, channel, arch: deps.arch, osVersion: deps.osVersion })
  }
  // The feed, read only through the signature check (src/signed-feed-provider.js).
  updater.setFeedURL({ provider: 'custom', updateProvider: deps.feedProvider, url: deps.feedUrl })
  /** How a downloaded version gets installed here (A1): on quit, after Restart, or by hand. */
  const installMode = !deps.inPlace ? 'manual' : deps.platform === 'win32' ? 'restart' : 'quit'
  updater.autoInstallOnAppQuit = installMode === 'quit'
  updater.autoDownload = deps.inPlace
  updater.disableDifferentialDownload = true
  // A full NSIS installer only (council 10/10): a web installer would fetch a second package.
  updater.disableWebInstaller = true
  updater.channel = channel
  // Dev candidates are `X.Y.Z-dev.N`; a stable copy must never take one.
  updater.allowPrerelease = channel === 'dev'
  // LAST: electron-updater's `channel` setter turns `allowDowngrade` back on.
  updater.allowDowngrade = false

  let failures = 0
  let timer = null
  let installing = false
  let downloadedVersion = null
  /** The version the person was last asked about, so a scheduled re-check does not ask again. */
  let askedAbout = null
  /** The "ready to install" question on screen, if one is: Restart on the page reuses it. */
  let asking = null
  /** The check that runs, shared by the timer, the menu and the page. */
  let inFlight = null
  /** The running check was asked for by the page: what it finds is told on the page, not in a dialog. */
  let pageAsked = false
  /** The last `features` of the `update-available` info, for the download address. */
  let availableFiles
  /** The last version the feed offered, for the download address of a copy that cannot install. */
  let availableVersion = null
  /** Versions handed to Squirrel.Mac, oldest first: its own `update-downloaded` stages the oldest. */
  const handedToSquirrel = []
  /** The reminder's timer and when it last reminded. */
  let reminderTimer = null
  let lastRemindedAt = null
  const remindAfterMs = deps.remindAfterMs ?? REMIND_AFTER_MS
  const remindEveryMs = deps.remindEveryMs ?? REMIND_EVERY_MS
  /** The blocked screen's Update, waiting for a download to finish. */
  let updateWaiter = null

  let state = initialUpdateState({ autoCheck: prefs.read().autoCheck })
  const watchers = new Set()
  /** @param {{ type: string, [key: string]: unknown }} event */
  const dispatch = (event) => {
    if (event.type === 'progress' && Math.round(Number(event.percent) || 0) === state.percent) return
    state = reduceUpdate(state, event)
    for (const watcher of watchers) {
      try {
        watcher(state)
      } catch (error) {
        log(`update state watcher failed: ${error.message}`)
      }
    }
  }

  // Every timer is logged when it is set, when it fires (and how late) and when it is cleared, so a
  // silent updater.log tells which of the three stopped: a timer never set, one cleared by code, or
  // one that came due while the main process could not run it (tasks/todo-desktop-update-policy.md
  // step 0).
  /** When the pending timer is due, and why it was set. */
  let due = null
  const clear = (why) => {
    if (timer) {
      timers.clearTimeout(timer)
      if (why) log(`update timer cleared: ${why} (was due ${new Date(due.at).toISOString()})`)
    }
    timer = null
    due = null
  }
  const schedule = (ms, why) => {
    clear()
    due = { at: now() + ms, why }
    log(`update timer set: ${why}, in ${ms} ms, due ${new Date(due.at).toISOString()}`)
    timer = timers.setTimeout(tick, ms)
  }

  /** One check; every caller of a check that already runs gets that one's outcome. */
  function runCheck() {
    inFlight ??= (async () => {
      try {
        const result = await updater.checkForUpdates()
        failures = 0
        return { result }
      } catch (error) {
        failures++
        log(`update check failed (${failures} in a row): ${error.message}`)
        dispatch({ type: 'error', at: now() })
        return { error }
      } finally {
        inFlight = null
        pageAsked = false
        // Only while automatic checks are on: a check that was running when the switch went off
        // finishes, and schedules nothing after it.
        if (state.autoCheck) {
          const delay = nextCheckDelay({ failures, random: deps.random(), intervalMs })
          schedule(delay, failures > 0 ? `retry after ${failures} failed` : 'next check')
          if (failures > 0) dispatch({ type: 'retry-at', at: now() + delay })
        }
      }
    })()
    return inFlight
  }

  async function tick() {
    if (due) log(`update timer fired: ${due.why}, ${now() - due.at} ms late`)
    timer = null
    due = null
    await runCheck()
  }

  /** Squirrel.Mac can still refuse here (a signature that does not match): say so, allow a retry. */
  function restartToUpdate() {
    if (installing || downloadedVersion === null) return
    installing = true
    dispatch({ type: 'install' })
    try {
      updater.quitAndInstall(false, true)
    } catch (error) {
      installing = false
      log(`update install refused: ${error.message}`)
      dispatch({ type: 'error', at: now() })
    }
  }

  updater.on('error', (error) => {
    log(`updater error: ${error?.message ?? error}`)
    // Squirrel.Mac refuses an install asynchronously (a bundle whose signature does not satisfy
    // this app's designated requirement): the app keeps running, and "Restart" may be tried again.
    installing = false
    dispatch({ type: 'error', at: now() })
    settleWaiter({ outcome: 'failed', reason: String(error?.message ?? error) })
  })

  /** Squirrel.Mac's own word that it prepared the version handed to it (A1, council: two "downloaded"s). */
  const native = installMode === 'quit' && deps.platform === 'darwin' ? updater.nativeUpdater : undefined
  native?.on?.('update-downloaded', () => {
    const version = handedToSquirrel.shift()
    if (version === undefined) return
    log(`update ${version}: Squirrel prepared ${version}; it installs when the app quits`)
    dispatch({ type: 'staged', version })
  })
  native?.on?.('error', (error) => {
    const version = handedToSquirrel.shift()
    if (version !== undefined)
      log(`update ${version}: Squirrel refused ${version}: ${error?.message ?? error}`)
  })

  updater.on('checking-for-update', () => dispatch({ type: 'checking' }))
  updater.on('update-not-available', () => dispatch({ type: 'not-available', at: now() }))
  updater.on('download-progress', (progress) => dispatch({ type: 'progress', percent: progress?.percent }))

  const downloadAddress = (version) => {
    const url = downloadUrl({
      feedUrl: deps.feedUrl,
      channel,
      version,
      arch: deps.arch,
      platform: deps.platform,
      files: availableFiles
    })
    if (url === null) log(`update ${version}: no download address on the feed; nothing opened`)
    return url
  }

  updater.on('update-available', (info) => {
    log(`update available: ${info.version}`)
    availableFiles = info.files
    availableVersion = info.version
    dispatch({
      type: 'available',
      at: now(),
      version: info.version,
      inPlace: deps.inPlace,
      releaseNotes: info.releaseNotes
    })
    if (deps.inPlace || askedAbout === info.version) return
    askedAbout = info.version
    // Found by the page's own button: the page already says so and offers Download (council §2.4.6).
    if (pageAsked) return
    void deps.ask({ kind: 'available', version: info.version }).then((answer) => {
      if (answer !== 'download') return
      const url = downloadAddress(info.version)
      if (url !== null) deps.openExternal(url)
    })
  })

  updater.on('update-downloaded', (info) => {
    const fresh = downloadedVersion !== info.version
    downloadedVersion = info.version
    log(`update downloaded: ${info.version}`)
    if (native && fresh) handedToSquirrel.push(info.version)
    dispatch({ type: 'downloaded', at: now(), version: info.version, releaseNotes: info.releaseNotes })
    // The AppImage updater installs the downloaded file itself on quit: staged as soon as it is here.
    if (installMode === 'quit' && !native) dispatch({ type: 'staged', version: info.version })
    armReminder()
    if (settleWaiter({ outcome: 'installing', version: info.version })) {
      restartToUpdate()
      return
    }
    // Windows keeps its one native question per version; nothing asks on its own anywhere else.
    if (installMode !== 'restart' || askedAbout === info.version) return
    void askToRestart(info.version)
  })

  /** (A3) The reminder, due REMIND_AFTER_MS after the version was first ready, then once a day. */
  function armReminder() {
    if (reminderTimer !== null) timers.clearTimeout(reminderTimer)
    reminderTimer = null
    const since = state.readySince
    if (typeof since !== 'number' || typeof deps.remind !== 'function') return
    const dueAt = lastRemindedAt === null ? since + remindAfterMs : lastRemindedAt + remindEveryMs
    reminderTimer = timers.setTimeout(remindIfDue, Math.max(0, dueAt - now()))
  }
  function remindIfDue() {
    reminderTimer = null
    const ready = state.status === 'downloaded' || state.status === 'install-error'
    if (!ready) return
    const at = now()
    if (
      reminderDue({
        readySince: state.readySince,
        lastRemindedAt,
        now: at,
        afterMs: remindAfterMs,
        everyMs: remindEveryMs
      })
    ) {
      lastRemindedAt = at
      log(`update ${state.version}: ready since ${new Date(state.readySince).toISOString()}; reminding`)
      try {
        deps.remind(state.version)
      } catch (error) {
        log(`update reminder failed: ${error.message}`)
      }
    }
    armReminder()
  }

  /** Hand a finished download to the blocked screen's Update, if it waits. @returns {boolean} */
  function settleWaiter(result) {
    if (updateWaiter === null) return false
    const waiter = updateWaiter
    updateWaiter = null
    waiter(result)
    return result.outcome === 'installing'
  }

  /**
   * The blocked screen's Update (C7): get a version at or above `minimumVersion` installed, now.
   *   downloaded already      install it (no question: the screen IS the question);
   *   cannot replace itself   open the checked download address;
   *   otherwise               check, wait for the download, install.
   * What it cannot do it says, once — the screen offers Retry, never loops:
   *   unavailable  the feed offers nothing this copy can take (none for this system or arch, or one
   *                still below the minimum); failed  the check, the download or the install failed.
   * @param {{ minimumVersion: string | null }} input
   * @returns {Promise<{ outcome: 'installing' | 'link' | 'unavailable', version: string | null } | { outcome: 'failed', reason: string }>}
   */
  async function updateNow({ minimumVersion }) {
    const enough = (version) =>
      typeof version === 'string' &&
      (minimumVersion === null || !(compareVersions(version, minimumVersion) < 0))
    if (downloadedVersion !== null && enough(downloadedVersion) && deps.inPlace) {
      restartToUpdate()
      return { outcome: 'installing', version: downloadedVersion }
    }
    const { result, error } = await runCheck()
    if (error) return { outcome: 'failed', reason: error.message }
    const offered = result?.isUpdateAvailable ? result.updateInfo.version : null
    if (!enough(offered)) {
      log(
        `update for the minimum ${minimumVersion}: the feed offers ${offered ?? 'nothing'} this copy can take`
      )
      return { outcome: 'unavailable', version: offered }
    }
    if (!deps.inPlace) {
      const url = downloadAddress(offered)
      if (url === null) return { outcome: 'unavailable', version: offered }
      deps.openExternal(url)
      return { outcome: 'link', version: offered }
    }
    if (downloadedVersion === offered) {
      restartToUpdate()
      return { outcome: 'installing', version: offered }
    }
    return new Promise((resolve) => {
      updateWaiter = resolve
    })
  }

  /** The native "ready to install" question; one on screen at a time. */
  function askToRestart(version) {
    askedAbout = version
    asking ??= deps
      .ask({ kind: 'downloaded', version })
      .then((answer) => {
        if (answer === 'restart') restartToUpdate()
        return answer
      })
      .finally(() => {
        asking = null
      })
    return asking
  }

  /** "Check for Updates…" in the app menu: check now, and answer even when there is nothing new. */
  async function checkNow() {
    const { result, error } = await runCheck()
    if (error) {
      await deps.ask({ kind: 'failed', reason: error.message })
      return
    }
    const version = result?.isUpdateAvailable ? result.updateInfo.version : null
    if (version === null) await deps.ask({ kind: 'current', version: deps.version })
    // Already downloaded (the person said "Later" before): ask again, they asked for it.
    else if (version === downloadedVersion) await askToRestart(version)
    // Still downloading: the "downloaded" question follows on its own.
    else if (deps.inPlace) await deps.ask({ kind: 'downloading', version })
  }

  /** The switch on the page. Saved first; only a saved choice changes the schedule and the state. */
  let switchQueue = Promise.resolve()
  function setAutoCheck(on) {
    if (typeof on !== 'boolean') return Promise.reject(new TypeError('autoCheck must be a boolean'))
    const job = switchQueue.then(async () => {
      await prefs.write({ autoCheck: on })
      const was = state.autoCheck
      if (on === was) return
      dispatch({ type: 'auto-check', on })
      if (!on) clear('automatic checks switched off')
      // Back on: exactly one early check, unless one already runs (its end schedules the next).
      else if (inFlight === null) schedule(INITIAL_CHECK_DELAY_MS, 'automatic checks switched back on')
      log(`automatic update checks ${on ? 'on' : 'off'}`)
    })
    switchQueue = job.catch(() => {})
    return job
  }

  log(`update schedule: automatic checks ${state.autoCheck ? 'on' : 'off'}, interval ${intervalMs} ms`)
  if (state.autoCheck) schedule(INITIAL_CHECK_DELAY_MS, 'first check after start')
  else log('automatic update checks are off; checking only when asked')

  return {
    checkNow,
    restartToUpdate,
    /** The page's "Check for updates": the state line answers, never a dialog. */
    check: async () => {
      // A check already running (timer, menu) keeps its own way of answering.
      if (inFlight === null) pageAsked = true
      await runCheck()
    },
    /** The page's "Restart to update": the native question first, only for a downloaded version. */
    restart: async () => {
      if (downloadedVersion === null || installing) return false
      if (state.status !== 'downloaded' && state.status !== 'install-error') return false
      await askToRestart(downloadedVersion)
      return true
    },
    /** The page's "Download" for a copy that cannot install itself. */
    download: () => {
      if (state.status !== 'available-manual' || state.version === null) return false
      const url = downloadAddress(state.version)
      if (url === null) return false
      deps.openExternal(url)
      return true
    },
    setAutoCheck,
    updateNow,
    /**
     * The blocked screen's Download: the checked download address (`downloadUrl`) of the newest
     * version the feed offered, else of `version` (the minimum). Nothing known → nothing opens.
     * @param {string | null} version
     */
    openDownload: (version) => {
      const wanted = availableVersion ?? version
      if (typeof wanted !== 'string') return false
      const url = downloadAddress(wanted)
      if (url === null) return false
      deps.openExternal(url)
      return true
    },
    /** @returns {'quit' | 'restart' | 'manual'} */
    installMode: () => installMode,
    getState: () => state,
    /** @param {(state: UpdateState) => void} watcher @returns {() => void} */
    onState: (watcher) => {
      watchers.add(watcher)
      return () => watchers.delete(watcher)
    },
    stop: () => {
      clear('updater stopped')
      if (reminderTimer !== null) timers.clearTimeout(reminderTimer)
      reminderTimer = null
    }
  }
}

module.exports = { startUpdater, readInstallId, downloadUrl }
