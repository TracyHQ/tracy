/**
 * Which agent CLIs are installed: for each id the page asks about, look for one of its commands
 * (src/agent-manifest.js) in the search directories. A file lookup only — the CLI is never run, not
 * even `--version` (Orca's src/main/preflight/agent-command-detection.ts, the idea ported).
 *
 * Found means a REGULAR file (a directory named `claude` is not the CLI — council 10/10/2026) that
 * POSIX lets someone execute; on Windows a regular file under one of the PATHEXT names. Any lookup
 * error (missing, no permission) is just "not there": no path or error ever leaves this module.
 *
 * Until the login shell's PATH is known (src/shell-path.js), a CLI not seen yet is `unknown`, not
 * `not-found`: the screen must not tell someone their CLI is missing before it has looked properly.
 */
const path = require('node:path')
const { AGENT_ID } = require('./agent-manifest.js')

const MAX_IDS = 32
const MAX_DIRS = 64
const MAX_PARALLEL = 8
const WINDOWS_EXTENSIONS = Object.freeze(['.exe', '.cmd', '.bat', '.com'])

/** Where CLIs install themselves outside the PATH a GUI app inherits (POSIX; `~` = home). */
const INSTALL_DIRS = Object.freeze([
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '~/.local/bin',
  '~/.npm-global/bin',
  '/snap/bin',
  '/home/linuxbrew/.linuxbrew/bin',
  '~/.nix-profile/bin'
])

/**
 * Throws a TypeError unless `ids` is an array of at most 32 agent ids.
 * @param {unknown} ids
 * @returns {asserts ids is string[]}
 */
function checkIds(ids) {
  if (!Array.isArray(ids)) throw new TypeError('ids must be an array')
  if (ids.length > MAX_IDS) throw new TypeError(`at most ${MAX_IDS} ids`)
  for (const id of ids)
    if (typeof id !== 'string' || id.length > 64 || !AGENT_ID.test(id))
      throw new TypeError('ids must be agent ids')
}

/** At most `limit` of the returned function's jobs run at once. */
function semaphore(limit) {
  let running = 0
  const waiting = []
  return async (job) => {
    if (running >= limit) await new Promise((resolve) => waiting.push(resolve))
    running++
    try {
      return await job()
    } finally {
      running--
      waiting.shift()?.()
    }
  }
}

/**
 * The directories to search, in order: `paths`, then the install directories (POSIX only); absolute
 * ones, each once, at most 64.
 */
function searchDirs(paths, platform, home) {
  const p = platform === 'win32' ? path.win32 : path.posix
  const extra =
    platform === 'win32'
      ? []
      : INSTALL_DIRS.map((dir) => (dir.startsWith('~/') ? p.join(home, dir.slice(2)) : dir))
  const dirs = []
  const seen = new Set()
  for (const dir of [...paths, ...extra]) {
    if (typeof dir !== 'string' || dir === '' || !p.isAbsolute(dir)) continue
    const key = platform === 'win32' ? dir.toLowerCase() : dir
    if (seen.has(key)) continue
    seen.add(key)
    dirs.push(dir)
    if (dirs.length === MAX_DIRS) break
  }
  return dirs
}

/**
 * @param {string[]} ids - agent ids, at most 32.
 * @param {object} deps
 * @param {Record<string, Record<string, readonly string[]>>} deps.manifest - src/agent-manifest.js.
 * @param {string[]} deps.paths - launch PATH entries, then the login shell's when known.
 * @param {string} deps.platform - `process.platform`.
 * @param {string} deps.home - the home folder, for `~` install directories.
 * @param {(file: string) => Promise<{ mode: number, isFile: () => boolean }>} deps.stat
 * @param {boolean} [deps.complete] - false while the login shell's PATH is not known yet.
 * @returns {Promise<{ results: { id: string, status: 'found' | 'not-found' | 'unknown' | 'unsupported' }[], scanComplete: boolean }>}
 */
async function detectAgents(ids, { manifest, paths, platform, home, stat, complete = true }) {
  checkIds(ids)
  const p = platform === 'win32' ? path.win32 : path.posix
  const dirs = searchDirs(paths, platform, home)
  const limit = semaphore(MAX_PARALLEL)

  const runnable = async (file) => {
    try {
      const info = await limit(() => stat(file))
      if (!info.isFile()) return false
      return platform === 'win32' || (info.mode & 0o111) !== 0
    } catch {
      return false
    }
  }

  const statusOf = async (id) => {
    const names =
      Object.hasOwn(manifest, id) && Object.hasOwn(manifest[id], platform) ? manifest[id][platform] : []
    if (names.length === 0) return 'unsupported'
    for (const dir of dirs)
      for (const name of names)
        for (const file of platform === 'win32' ? WINDOWS_EXTENSIONS.map((ext) => `${name}${ext}`) : [name])
          if (await runnable(p.join(dir, file))) return 'found'
    return complete ? 'not-found' : 'unknown'
  }

  const statuses = await Promise.all(ids.map(statusOf))
  return { results: ids.map((id, i) => ({ id, status: statuses[i] })), scanComplete: complete }
}

module.exports = { detectAgents, checkIds, INSTALL_DIRS }
