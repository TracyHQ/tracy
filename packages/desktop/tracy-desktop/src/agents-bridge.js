/**
 * The agents bridge: `window.tracyDesktop.app.agents` (shell/preload.ts), which the first-run screen
 * uses to put the agent CLIs already on this machine first. Channels in src/update-channels.js.
 *
 * `detect(ids)` answers AT ONCE from the app's own PATH and the usual install directories, and the
 * first call starts reading the login shell's PATH in the background (src/shell-path.js; one read
 * shared by every window). Until that read settles the answer says `scanComplete: false`, and a CLI
 * not seen yet is `unknown`; after it, the shell's directories are searched too and the scan is
 * complete. A read that FAILED (timeout, unknown shell) leaves the scan incomplete: what was not
 * found stays `unknown`, never `not-found` — the page must not say "not installed" on a half scan
 * (plan §2.2, measured 10/10/2026) — and the reason goes to the log, not to the page. `refresh(ids)` reads the shell again
 * and waits for it, at most once per 10 s; within that it answers from what is known.
 *
 * WHAT GOES BACK: ids and statuses only — never a PATH, a directory, a found path or an fs error.
 * The page names ids, never commands (src/agent-manifest.js). Who may ask: src/bridge-guard.js.
 */
const fs = require('node:fs')
const path = require('node:path')
const { createProductBridge } = require('./bridge-guard.js')
const { AGENT_MANIFEST } = require('./agent-manifest.js')
const { checkIds, detectAgents } = require('./agent-detect.js')
const { AGENT_CHANNELS } = require('./update-channels.js')

/** A refresh asked for within this long after the last one does not read the shell again. */
const REFRESH_GAP_MS = 10_000

/** The app's own PATH entries (Windows names the variable in any case). */
function launchPath(env, platform) {
  const key = platform === 'win32' ? Object.keys(env).find((name) => name.toLowerCase() === 'path') : 'PATH'
  const value = key === undefined ? undefined : env[key]
  return typeof value === 'string' ? value.split(platform === 'win32' ? ';' : path.posix.delimiter) : []
}

/**
 * @param {object} deps
 * @param {{ handle: Function, removeHandler: Function }} deps.ipcMain
 * @param {string} deps.origin - the pinned origin.
 * @param {{ read: (options?: { force?: boolean }) => Promise<import('./shell-path.js').ShellPathResult> }} deps.reader
 * @param {typeof detectAgents} [deps.detect]
 * @param {(file: string) => Promise<{ mode: number, isFile: () => boolean }>} [deps.stat]
 * @param {string} deps.platform - `process.platform`.
 * @param {Record<string, string | undefined>} deps.env - the app's environment; read once, never written.
 * @param {string} deps.home
 * @param {() => number} [deps.now]
 * @param {(line: string) => void} [deps.log]
 */
function createAgentsBridge({
  ipcMain,
  origin,
  reader,
  detect = detectAgents,
  stat = (file) => fs.promises.stat(file),
  platform,
  env,
  home,
  now = Date.now,
  log = () => {}
}) {
  const launch = launchPath(env, platform)

  /** The last settled shell read, or null while none has. */
  let shellPath = null
  /** The read in flight, or null. */
  let reading = null
  let lastRefreshAt = Number.NEGATIVE_INFINITY

  const startRead = (force) => {
    const read = Promise.resolve(reader.read({ force }))
      .catch(() => ({ ok: false, segments: [], reason: 'spawn_error' }))
      .then((result) => {
        // An older read settling after a newer one started changes nothing.
        if (reading !== read) return
        shellPath = result
        reading = null
        log(
          result.ok
            ? `agents bridge: login shell PATH read (${result.segments.length} directories)`
            : `agents bridge: login shell PATH not read (${result.reason}); detection uses the app PATH and install dirs`
        )
      })
    reading = read
    return read
  }

  const answer = (ids) =>
    detect(ids, {
      manifest: AGENT_MANIFEST,
      paths: shellPath?.ok ? [...launch, ...shellPath.segments] : launch,
      platform,
      home,
      stat,
      complete: shellPath?.ok === true
    })

  const bridge = createProductBridge({
    ipcMain,
    origin,
    label: 'agents bridge',
    log,
    handlers: {
      [AGENT_CHANNELS.detect]: (ids) => {
        checkIds(ids)
        if (shellPath === null && reading === null) void startRead(false)
        return answer(ids)
      },
      [AGENT_CHANNELS.refresh]: async (ids) => {
        checkIds(ids)
        if (now() - lastRefreshAt >= REFRESH_GAP_MS) {
          lastRefreshAt = now()
          await startRead(true)
        }
        return answer(ids)
      }
    }
  })

  return { attach: bridge.attach, dispose: bridge.dispose }
}

module.exports = { createAgentsBridge }
