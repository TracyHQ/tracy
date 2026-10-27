/**
 * Where a SOURCE run of the app keeps its data (cookies, cache, window place, runtime.json).
 *
 * Electron keys its data folder by the app name, and a source run is always named after
 * package.json — so before this, every source run on a machine (any worktree, any origin: the local
 * dsh, cowork.tracy.site, a stand) shared ONE cookie jar. Several agent sessions run the app side by
 * side on one machine; one of them signing in to a stand signed the others' windows in or out.
 *
 * Now each source run gets `<root>/<worktree>/<origin>/<instance>`:
 *   - root:     `<appData>/Tracy Cowork Source` (`~/Library/Application Support/…` on macOS), or
 *               TRACY_DESKTOP_PROFILE_ROOT
 *   - worktree: the checkout's folder name plus a hash of its full path (two checkouts both called
 *               `TCH` in different places stay apart)
 *   - origin:   `local` for the app's own dsh, else the origin's host plus a hash of the origin
 *   - instance: `default`, or TRACY_DESKTOP_INSTANCE — an agent or an E2E run picks a fresh one
 *
 * A PACKAGED app returns undefined and keeps Electron's own folder: it must ignore both variables,
 * since a customer's machine is not a place for a stray environment variable to move their data.
 */

const crypto = require('node:crypto')
const path = require('node:path')

/**
 * The name a source run shows (window, menu, failure page). Never `Tracy Cowork`, even against
 * production: only a packaged build pinned there is the production app (build/package.sh), and a
 * source run should not look like one. Without this it would show the package.json name.
 */
const SOURCE_NAME = 'Tracy Cowork Dev'

/** The folder under Electron's `appData` that holds every source-run profile. */
const ROOT_FOLDER = 'Tracy Cowork Source'

const DEFAULT_INSTANCE = 'default'
const INSTANCE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

/**
 * @param {string} value
 * @returns {string} 10 hex characters of its SHA-256 — enough to tell checkouts and origins apart.
 */
function shortHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 10)
}

/**
 * @param {string} value
 * @returns {string} the value reduced to characters safe in a folder name.
 */
function slug(value) {
  return value.replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
}

/**
 * @param {string | undefined} raw - TRACY_DESKTOP_PROFILE_ROOT.
 * @param {string} appData - Electron's `app.getPath('appData')`.
 * @returns {string} the validated root.
 */
function profileRoot(raw, appData) {
  if (raw === undefined) return path.join(appData, ROOT_FOLDER)
  if (!path.isAbsolute(raw)) {
    throw new Error(`TRACY_DESKTOP_PROFILE_ROOT must be an absolute path, got ${JSON.stringify(raw)}`)
  }
  const root = path.resolve(raw)
  if (root === path.parse(root).root) {
    throw new Error(`TRACY_DESKTOP_PROFILE_ROOT must not be the filesystem root, got ${JSON.stringify(raw)}`)
  }
  return root
}

/**
 * @param {string | undefined} raw - TRACY_DESKTOP_INSTANCE.
 * @returns {string} the validated instance name.
 */
function instanceName(raw) {
  if (raw === undefined) return DEFAULT_INSTANCE
  if (!INSTANCE_PATTERN.test(raw) || raw === '.' || raw === '..') {
    throw new Error(
      `TRACY_DESKTOP_INSTANCE must be one folder name of 1-64 letters, digits, '.', '_' or '-', got ${JSON.stringify(raw)}`
    )
  }
  return raw
}

/**
 * @param {string} origin - an origin, or `local` for the app's own dsh.
 * @returns {string} the origin's folder name.
 */
function originFolder(origin) {
  const value = origin.replace(/\/+$/, '')
  if (value === 'local') return 'local'
  let host = value
  try {
    host = new URL(value).host
  } catch {
    // Not a URL: the hash still keeps it apart from every other origin.
  }
  return `${slug(host)}-${shortHash(value)}`
}

/**
 * The profile folder of a source run.
 * @param {object} input
 * @param {boolean} input.packaged - `app.isPackaged`.
 * @param {string} input.repo - the checkout the app runs from.
 * @param {string} input.origin - the origin the window opens, or `local` for the app's own dsh.
 * @param {Record<string, string | undefined>} input.env - usually `process.env`.
 * @param {string} input.appData - Electron's `app.getPath('appData')`.
 * @returns {{ dir: string, name: string, instance: string, explicitInstance: boolean } | undefined} undefined for a
 *   packaged app. Throws when TRACY_DESKTOP_PROFILE_ROOT or TRACY_DESKTOP_INSTANCE is invalid.
 */
function sourceProfile({ packaged, repo, origin, env, appData }) {
  if (packaged) return undefined
  const root = profileRoot(env.TRACY_DESKTOP_PROFILE_ROOT, appData)
  const instance = instanceName(env.TRACY_DESKTOP_INSTANCE)
  const checkout = path.resolve(repo)
  const worktree = `${slug(path.basename(checkout))}-${shortHash(checkout)}`
  return {
    dir: path.join(root, worktree, originFolder(origin), instance),
    name: SOURCE_NAME,
    instance,
    explicitInstance: env.TRACY_DESKTOP_INSTANCE !== undefined
  }
}

/**
 * The CDP address of a run started with `--remote-debugging-port=0`.
 *
 * Port 0 lets Chromium pick a free port (9222 belongs to chrome-watch) and write it as the first line
 * of `DevToolsActivePort` in the data folder. Chromium binds that port on loopback only.
 * @param {string | undefined} text - the file's content, or undefined when there is no such file.
 * @returns {string | null} `http://127.0.0.1:<port>`, or null when the run has no debug port.
 */
function cdpFromActivePort(text) {
  const line = (text ?? '').split('\n')[0].trim()
  if (!/^\d{1,5}$/.test(line)) return null
  const port = Number(line)
  return port > 0 && port < 65536 ? `http://127.0.0.1:${port}` : null
}

/**
 * What `<profile>/runtime.json` says about a source run, for the agent that started it: which process
 * it is (so it stops only its own), which commit and origin it runs, and where to attach.
 * @param {object} input
 * @param {number} input.pid
 * @param {string | null} input.sha - HEAD of the checkout, or null when git could not say.
 * @param {string} input.origin - the origin the window opened, or `local`.
 * @param {string} input.profile - the profile folder.
 * @param {string | undefined} input.activePort - content of `DevToolsActivePort`, if any.
 * @param {string | undefined} input.inspect - the Node inspector URL of the main process, if any.
 */
function runtimeRecord({ pid, sha, origin, profile, activePort, inspect }) {
  return { pid, sha, origin, profile, cdp: cdpFromActivePort(activePort), inspect: inspect || null }
}

/**
 * What a second process does when the profile's single-instance lock is already held.
 *
 * Without an explicit instance it is a person double-clicking: hand over to the running window and
 * quit quietly. With TRACY_DESKTOP_INSTANCE it is an agent or a test that asked for THIS profile, and
 * quietly handing over would let it drive another agent's app — so it fails, saying why.
 * @param {{ explicitInstance: boolean, dir: string }} profile
 * @returns {{ code: number, message: string | undefined }} the exit code, and a line for stderr
 *   (without its newline).
 */
function secondLaunch({ explicitInstance, dir }) {
  if (!explicitInstance) return { code: 0, message: undefined }
  return {
    code: 3,
    message:
      `tracy-desktop: another process already runs the profile ${dir} — ` +
      'pick a fresh TRACY_DESKTOP_INSTANCE, or stop the process that owns it (its pid is in runtime.json)'
  }
}

module.exports = { sourceProfile, cdpFromActivePort, runtimeRecord, secondLaunch }
