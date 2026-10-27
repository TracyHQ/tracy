/**
 * Run one command, streaming its combined stdout+stderr one line at a time to a log file and to a
 * caller-supplied callback — the thing `/_host/provision`, `/_host/teardown` and the webroot jobs
 * poll for progress against (a `step` parsed out of a `==` line, a `port` out of `TRACY_RESULT
 * port=`, in `provision.js`).
 *
 * Ported from `tracy-hooks.contabo.py`'s subprocess handling inside `provision()`/`run_teardown()`
 * (py:380-449, py:481+): `stdbuf -oL <script> <args...>`, read one line at a time, stdout and
 * stderr merged into a single stream so nothing is lost to interleaving. `/health` (`server.js`)
 * uses the exact same function for its `docker version` probe — there is only one runner in this
 * process, not a real one for jobs and a shim for health.
 *
 * `stdbuf -oL` line-buffers the child's stdout: bash and the coreutils it calls block-buffer their
 * stdout when it isn't a terminal — here it's a pipe — so without this the last line a dying
 * script printed (the step it failed on) can sit in a 4 KB buffer that a sudden death throws away.
 * Measured on the Python original: a real provision failure read as nothing but
 * "provision_failed" for a whole evening because the log stopped one line short of the truth
 * (juneflower.vn, 2026-08-14).
 *
 * The stdout/stderr merge is done by the CHILD, not by Node reading two separate pipes and
 * interleaving them in JS: `bash -c 'exec "$@" 2>&1' -- stdbuf -oL <script> <args...>` duplicates
 * the child's fd 2 onto fd 1 BEFORE exec, so both land in the one OS pipe in the exact order the
 * child wrote them — the same ordering guarantee Python's `stderr=subprocess.STDOUT` gets from
 * `dup2`. Two Node streams read independently and merged after the fact cannot promise that
 * order; this can, because the merge happens before Node ever sees a byte.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdir, appendFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * `stdbuf` is GNU coreutils — present on every fleet host and in the `node:24-slim` image (Task
 * 5's Dockerfile), absent on a bare macOS dev machine (BSD userland, no coreutils by default).
 * Checked once per process, not per call: this never changes while the process is running, and a
 * `spawnSync` on every `runScript` call would be a needless fork for something that never
 * changes. Its absence only costs the line-buffering guarantee described above — real scripts
 * still run, still merge stdout+stderr in order, and a test on a laptop still gets to assert
 * something instead of failing on a binary the test was never about.
 */
const HAS_STDBUF = spawnSync('which', ['stdbuf']).status === 0

/** How many of the most recent lines a caller gets back in `tail`. Enough to show why a job
 * failed (the python original kept the last 4000 characters; this migration's contract is 200
 * LINES instead — see provision.test.mjs). Bounded so a long-running provision streaming
 * thousands of lines can't turn `tail` into an unbounded array — an unbounded tail is a memory
 * leak on a job that runs for minutes, not a rounding error. */
const TAIL_LINES = 200

/**
 * @param {object} input
 * @param {string} input.script - the command to run, e.g. `'bash'` (with the actual script path
 *   as the first element of `args`) or `'docker'` (`/health`'s probe).
 * @param {string[]} [input.args] - arguments to `script`.
 * @param {object} [input.env] - environment for the child process (defaults to `process.env`).
 * @param {string} [input.logPath] - append every line here as it arrives; omit to skip logging
 *   entirely (`/health`'s `docker version` probe has nothing worth logging to a file).
 * @param {string} [input.stdin] - written to the child's standard input and closed. The one way
 *   a secret may reach a child: an argument would be visible in the host's process list.
 * @param {(line: string) => void | Promise<void>} [input.onLine] - called once per line and
 *   awaited before the next line is read, so a caller's own job-state writes (`jobs.js`) land in
 *   the same order the lines were printed.
 * @param {number} [input.timeoutMs] - kill the run after this long: SIGTERM to the child's whole
 *   process group (the script AND the git/curl it started — killing the script alone would orphan
 *   a hung `git push` that keeps holding its repo lock), then SIGKILL ten seconds later. Only set
 *   by callers nobody waits on (`sync.js`'s clocks); a run with no limit is spawned exactly as
 *   before, in this process's own group.
 * @param {number} [input.idleMs] - kill the run when it has printed no line for this long, the same way
 *   as `timeoutMs` (16/10/2026, provision: a hung step prints nothing, while a long but healthy one —
 *   EmDash's first image build, ~21 min — keeps printing). Only with `timeoutMs`, whose process group it
 *   signals.
 * @returns {Promise<{code: number | null, tail: string[], signal?: string, spawnError?: string,
 *   timedOut?: true, idle?: true}>} the child's OWN exit code and the last up-to-200 lines it printed.
 *
 *   🔒 `code` IS A NUMBER ONLY WHEN THE CHILD EXITED BY ITSELF. A child a signal ended has no exit
 *   code: `code` is null and `signal` names the signal. One that could not be started has none
 *   either: `code` is null and `spawnError` says why. Both used to come back as `code: 1`, which a
 *   caller cannot tell from a script that ran to its own `exit 1` — and the go-live job recorded
 *   exactly that, as the script's failure, for a run whose group may still have been at work
 *   (`webroot.js` `runGoLiveJob`). Every caller's `code === 0` / `code !== 0` reads null as "not a
 *   success", as before; only a caller that wants the script's own word looks at the kind.
 *   `timedOut` when `timeoutMs` ran out (the signal is then this function's own).
 */
export async function runScript({ script, args = [], env, logPath, onLine, stdin, timeoutMs, idleMs }) {
  if (logPath) await mkdir(path.dirname(logPath), { recursive: true })

  const inner = HAS_STDBUF ? ['stdbuf', '-oL', script, ...args] : [script, ...args]
  const limited = Number.isFinite(timeoutMs) && timeoutMs > 0
  const child = spawn('bash', ['-c', 'exec "$@" 2>&1', '_', ...inner], {
    env: env ?? process.env,
    // Its own process group, so the time limit below can signal every process the run started.
    detached: limited,
    // 🔒 `stdin` IS HOW A SECRET REACHES A CHILD WITHOUT REACHING THE PROCESS LIST. `/_host/model-keys`
    // writes a credential file inside the dsh container; passing the key as an argument would put it
    // in `ps` output for anything else on that machine, and in this process's own log tail. Every
    // other caller passes nothing and keeps the old `ignore`.
    stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore']
  })
  if (stdin !== undefined) {
    child.stdin.end(stdin)
    // A child that exits before reading its input makes the write fail; that is the child's exit
    // code to report, not an unhandled error event on this stream.
    child.stdin.on('error', () => {})
  }

  // Registered before the read loop below starts, so a process that fails to start at all (or
  // dies before printing a single line) is still observed — `close`/`error` can fire while
  // nothing has ever been read from `child.stdout`.
  const closed = new Promise((resolve) => {
    // `close` hands (code, signal): exactly one of them is set. Kept apart, never folded into a code.
    child.once('close', (code, signal) =>
      resolve(Number.isInteger(code) ? { code } : { code: null, signal: signal ?? 'unknown' })
    )
    child.once('error', (error) =>
      resolve({ code: null, spawnError: String(error?.code ?? error?.message ?? error).slice(0, 200) })
    )
  })

  let timedOut = false
  let killTimer = null
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal)
    } catch {
      // Already gone.
    }
  }
  const limitTimer = limited
    ? setTimeout(() => {
        timedOut = true
        signalGroup('SIGTERM')
        killTimer = setTimeout(() => signalGroup('SIGKILL'), 10_000)
        killTimer.unref?.()
      }, timeoutMs)
    : null
  limitTimer?.unref?.()
  // Silence is measured from the last line; each line the child prints starts it again.
  let idle = false
  let idleTimer = null
  const watchIdle = () => {
    if (!limited || !(Number.isFinite(idleMs) && idleMs > 0)) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (timedOut) return
      timedOut = true
      idle = true
      signalGroup('SIGTERM')
      killTimer = setTimeout(() => signalGroup('SIGKILL'), 10_000)
      killTimer.unref?.()
    }, idleMs)
    idleTimer.unref?.()
  }
  watchIdle()

  const tail = []
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
  for await (const line of rl) {
    tail.push(line)
    if (tail.length > TAIL_LINES) tail.shift()
    if (logPath) await appendFile(logPath, `${line}\n`)
    await onLine?.(line)
    watchIdle()
  }

  const ended = await closed
  if (limitTimer) clearTimeout(limitTimer)
  if (idleTimer) clearTimeout(idleTimer)
  if (killTimer) clearTimeout(killTimer)
  if (!timedOut) return { ...ended, tail }
  // Said in the log too: a run cut off mid-line otherwise reads as one that just stopped.
  const note = idle
    ? `[run] killed after ${idleMs} ms with no output — stopped making progress`
    : `[run] killed after ${timeoutMs} ms — over its time limit`
  tail.push(note)
  if (tail.length > TAIL_LINES) tail.shift()
  if (logPath) await appendFile(logPath, `${note}\n`)
  // Over its limit is never a success, whatever the child managed to exit with while being stopped.
  return {
    ...ended,
    code: ended.code === 0 ? 1 : ended.code,
    tail,
    timedOut: true,
    ...(idle ? { idle: true } : {})
  }
}
