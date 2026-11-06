/**
 * The body of `.github/actions/turbo-cache` (see `action.yml`): starts
 * `scripts/ci/turbo-cache-server.mjs` detached on 127.0.0.1, waits until it answers, and exports
 * TURBO_API, TURBO_TOKEN and TURBO_TEAM for the job's later steps (plus TRACY_DSH_COMMIT and
 * TURBO_TELEMETRY_DISABLED, whatever happens).
 *
 * WHY A `node` ACTION. The server talks to the GitHub Actions cache with ACTIONS_RUNTIME_TOKEN and
 * ACTIONS_RESULTS_URL, and the runner gives those to JavaScript actions only — a `run` step never
 * sees them. So this file runs as the action, hands the two to the server through its environment
 * only (never a file, never a log line), and exits; the server outlives it (detached, its output in
 * `$RUNNER_TEMP/turbo-cache.log`) until the runner's orphan-process cleanup at the end of the job.
 *
 * 🔒 IT NEVER FAILS THE JOB. A cache that does not start leaves Turbo on its local cache: a test row
 * then runs every task it was given, and the plan job sees every task as missing — both fail closed.
 *
 * 🔒 A FORK'S PULL REQUEST NEVER WRITES. Tracy CI does not run this for one today (`plan` and
 * `build-check` admit same-repository pull requests only), and if it ever does, the server starts
 * read-only.
 */
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** How long the job waits for the server: TRIES × NAP_MS (`ci-turbo-rows.test.mjs` budgets it). */
export const TRIES = 50
export const NAP_MS = 200

const env = process.env
const exportVar = (name, value) => appendFileSync(env.GITHUB_ENV ?? '/dev/null', `${name}=${value}\n`)
const warn = (message) => console.log(`::warning::Turbo remote cache: ${message}; local cache only`)

/** True for a pull request whose head lives in another repository. Unreadable → treated as a fork. */
function fromFork() {
  if (!(env.GITHUB_EVENT_NAME ?? '').startsWith('pull_request')) return false
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? '', 'utf8'))
    return event.pull_request?.head?.repo?.full_name !== event.repository?.full_name
  } catch {
    return true
  }
}

async function main() {
  try {
    exportVar(
      'TRACY_DSH_COMMIT',
      execFileSync('git', ['rev-parse', 'HEAD:vendor/tracy/deepseek-harness'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    )
  } catch {
    exportVar('TRACY_DSH_COMMIT', '')
  }
  exportVar('TURBO_TELEMETRY_DISABLED', '1')
  if (!env.ACTIONS_RUNTIME_TOKEN || !env.ACTIONS_RESULTS_URL)
    return warn('the runner gave no ACTIONS_RUNTIME_TOKEN / ACTIONS_RESULTS_URL')
  const port = Number(env.INPUT_PORT || 43901)
  const token = randomBytes(24).toString('hex')
  console.log(`::add-mask::${token}`)
  const readOnly = fromFork()
  const logPath = join(env.RUNNER_TEMP ?? '/tmp', 'turbo-cache.log')
  const logFd = openSync(logPath, 'a')
  const server = fileURLToPath(new URL('../../../scripts/ci/turbo-cache-server.mjs', import.meta.url))
  const child = spawn(process.execPath, [server], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      PATH: env.PATH ?? '',
      PORT: String(port),
      TURBO_TOKEN: token,
      ACTIONS_RESULTS_URL: env.ACTIONS_RESULTS_URL,
      ACTIONS_RUNTIME_TOKEN: env.ACTIONS_RUNTIME_TOKEN,
      TURBO_CACHE_READ_ONLY: readOnly ? '1' : '0'
    }
  })
  child.unref()
  const api = `http://127.0.0.1:${String(port)}`
  for (let i = 0; i < TRIES; i++) {
    try {
      const r = await fetch(`${api}/v8/artifacts/status`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1000)
      })
      if (r.ok) {
        exportVar('TURBO_API', api)
        exportVar('TURBO_TOKEN', token)
        exportVar('TURBO_TEAM', 'tracy-ci')
        console.log(
          `Turbo remote cache up (GitHub Actions cache${readOnly ? ', read-only: a fork' : ''}), server pid ${String(child.pid)}`
        )
        return
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, NAP_MS))
  }
  warn('the server did not start')
  try {
    console.log(readFileSync(logPath, 'utf8').split('\n').slice(-20).join('\n'))
  } catch {
    // no log to show
  }
}

await main().catch((err) => warn(err instanceof Error ? err.message : String(err)))
