/**
 * The PATH the person's login shell builds, read once per run: what src/agent-detect.js searches,
 * besides the app's own PATH, to tell which agent CLIs are installed.
 *
 * WHY. An app opened from Finder or the Dock inherits launchd's minimal PATH; a CLI installed under
 * fnm, nvm, ~/.local/bin or Homebrew is invisible to it although it works in Terminal (Orca #829,
 * whose src/main/startup/hydrate-shell-path.ts this ports the idea of). So the shell is started once,
 * as a login + interactive shell (`-ilc`), with a FIXED command that prints `$PATH` between two
 * markers; only the text between them is used.
 *
 * WHAT IT DOES NOT DO (council 10/10/2026, tasks/todo-desktop-onboard-agent.md §Council):
 * - It never writes `process.env.PATH`: that would change which program every other child process
 *   of the app runs. The segments are a search list for agent detection only, kept in memory.
 * - It never guesses a shell's syntax: zsh, bash, fish and nu are known; any other `$SHELL` is
 *   `unsupported_shell` and nothing runs.
 * - On Windows it runs no profile at all: `Path` is read from the registry (Machine, then User).
 * `-ilc` does run the person's rc files (they may print, start tmux, wait): stdin is closed, output
 * is capped, the shell is killed at the time limit, and `TRACY_SHELL_PATH_PROBE=1` lets an rc file
 * take a fast path.
 */
const path = require('node:path')

const MARKER = '__TRACY_SHELL_PATH__'
const MAX_OUTPUT = 64 * 1024
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g // eslint-disable-line no-control-regex

const WINDOWS_KEYS = Object.freeze([
  'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
  'HKCU\\Environment'
])

/** The fixed probe command per shell, by basename. */
const PROBES = Object.freeze({
  zsh: `printf '%s' '${MARKER}'; printf '%s' "$PATH"; printf '%s' '${MARKER}'`,
  bash: `printf '%s' '${MARKER}'; printf '%s' "$PATH"; printf '%s' '${MARKER}'`,
  fish: `printf '%s' '${MARKER}'; string join : $PATH; printf '%s' '${MARKER}'`,
  // Nushell's PATH is a list; "$PATH" would print a literal.
  nu: `print -n '${MARKER}'; print -n ($env.PATH | str join (char esep)); print -n '${MARKER}'`
})

/**
 * @typedef {{ ok: boolean, segments: string[],
 *   reason: 'none' | 'timeout' | 'spawn_error' | 'empty_path' | 'unsupported_shell' }} ShellPathResult
 */

const failure = (reason) => ({ ok: false, segments: [], reason })

/** Absolute entries only, first occurrence kept (PATH lookup is first-match-wins). */
function cleanSegments(entries, isAbsolute) {
  return [
    ...new Set(entries.map((entry) => entry.trim()).filter((entry) => entry !== '' && isAbsolute(entry)))
  ]
}

/** The text between the two markers, or null. */
function between(stdout) {
  const text = stdout.replace(ANSI, '')
  const first = text.indexOf(MARKER)
  if (first === -1) return null
  const second = text.indexOf(MARKER, first + MARKER.length)
  if (second === -1) return null
  return text.slice(first + MARKER.length, second)
}

/**
 * `reg query <key> /v Path` output → `{ type, value }`, or null when there is no such value.
 * @param {string} stdout
 */
function parseRegQuery(stdout) {
  const m = /^\s+Path\s+(REG_EXPAND_SZ|REG_SZ)\s+(.*?)\s*$/im.exec(stdout)
  return m ? { type: m[1].toUpperCase(), value: m[2] } : null
}

/** `%NAME%` → the variable's value (names are case-insensitive on Windows); unknown ones stay. */
function expandWindowsVars(value, env) {
  const byName = new Map(Object.entries(env).map(([name, v]) => [name.toLowerCase(), v]))
  return value.replace(/%([^%;]+)%/g, (whole, name) => byName.get(name.toLowerCase()) ?? whole)
}

/**
 * @param {object} deps
 * @param {typeof import('node:child_process').spawn} deps.spawn
 * @param {string} deps.platform - `process.platform`.
 * @param {Record<string, string | undefined>} deps.env - the app's environment; read, never written.
 * @param {string} [deps.shell] - defaults to `$SHELL`, else zsh on macOS and bash elsewhere.
 * @param {number} [deps.timeoutMs]
 * @param {(key: string) => Promise<{ type: string, value: string } | null>} [deps.registryRead]
 * @returns {{ read: (options?: { force?: boolean }) => Promise<ShellPathResult> }}
 */
function createShellPathReader({ spawn, platform, env, shell, timeoutMs = 10_000, registryRead }) {
  /** Run `file args`, collect at most MAX_OUTPUT of stdout; kill on timeout or overflow. */
  function run(file, args, extraEnv = {}) {
    return new Promise((resolve) => {
      let child
      try {
        child = spawn(file, args, {
          stdio: ['ignore', 'pipe', 'ignore'],
          env: { ...env, ...extraEnv },
          windowsHide: true
        })
      } catch {
        resolve({ error: 'spawn_error' })
        return
      }
      let out = ''
      let done = false
      const finish = (result) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(result)
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish({ error: 'timeout' })
      }, timeoutMs)
      child.stdout?.on('data', (chunk) => {
        if (done) return
        out += chunk.toString('utf8')
        if (out.length > MAX_OUTPUT) {
          out = out.slice(0, MAX_OUTPUT)
          child.kill('SIGKILL')
          finish({ out })
        }
      })
      child.on('error', () => finish({ error: 'spawn_error' }))
      child.on('close', () => finish({ out }))
    })
  }

  async function readPosix() {
    const file = shell ?? (env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash'))
    const name = path.posix.basename(file)
    if (!Object.hasOwn(PROBES, name)) return failure('unsupported_shell')
    const command = PROBES[name]
    const { error, out } = await run(file, ['-ilc', command], { TRACY_SHELL_PATH_PROBE: '1' })
    if (error) return failure(error)
    const value = between(out)
    if (value === null) return failure('empty_path')
    const segments = cleanSegments(value.split(':'), path.posix.isAbsolute)
    return segments.length === 0 ? failure('empty_path') : { ok: true, segments, reason: 'none' }
  }

  const defaultRegistryRead = async (key) => {
    const { error, out } = await run('reg', ['query', key, '/v', 'Path'])
    if (error) throw new Error(error)
    return parseRegQuery(out)
  }

  async function readWindows() {
    const readKey = registryRead ?? defaultRegistryRead
    let timer
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    let entries
    try {
      const values = await Promise.race([Promise.all(WINDOWS_KEYS.map((key) => readKey(key))), timeout])
      if (values === 'timeout') return failure('timeout')
      entries = values.flatMap((found) => {
        if (found === null || typeof found?.value !== 'string') return []
        const value = found.type === 'REG_EXPAND_SZ' ? expandWindowsVars(found.value, env) : found.value
        return value.split(';')
      })
    } catch {
      return failure('spawn_error')
    } finally {
      clearTimeout(timer)
    }
    const segments = cleanSegments(entries, path.win32.isAbsolute)
    return segments.length === 0 ? failure('empty_path') : { ok: true, segments, reason: 'none' }
  }

  /** @type {Promise<ShellPathResult> | null} */
  let cached = null
  return {
    read({ force = false } = {}) {
      if (cached === null || force) cached = platform === 'win32' ? readWindows() : readPosix()
      return cached
    }
  }
}

module.exports = { createShellPathReader, parseRegQuery, SHELL_PATH_MARKER: MARKER }
