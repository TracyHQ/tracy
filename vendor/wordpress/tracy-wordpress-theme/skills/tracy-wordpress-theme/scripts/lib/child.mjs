// child.mjs — run a child process WITHOUT blocking the event loop, with a hard timeout.
//
// visual-qa used `spawnSync` for review/mega-hover.mjs. A synchronous spawn freezes the whole
// process for as long as the child runs, so the other axes that `mapLimit` keeps in flight stood
// still while one page's mega menu was walked. Measured 25/09 on Tracy Base wp7 (38 pages,
// light-desktop, concurrency 3, one machine, one run each): mega-hover took 16.9 s per page and every
// page carries the `mega` state; the full run took 774.7 s / 776.2 s with `spawnSync` and 402 s /
// 407.5 s with the awaited spawn below, with identical verdicts on the 33/33 pages whose HTML is
// deterministic.
//
// The bound on concurrent children is the caller's: each child is awaited inside one axis job, so
// no more children run than axes are in flight. The timeout kills the child (SIGKILL) and says so
// in the result, instead of leaving a Chromium behind.
import { spawn } from 'node:child_process'

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ timeoutMs?: number, maxBytes?: number, cwd?: string, env?: object }} [o]
 * @returns {Promise<{ status: number|null, signal: string|null, stdout: string, stderr: string, timedOut: boolean, ms: number, error: string|null }>}
 */
export function runChild(cmd, args, { timeoutMs = 120000, maxBytes = 1 << 20, cwd, env } = {}) {
  const t0 = performance.now()
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const done = (r) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, timedOut, ms: Math.round(performance.now() - t0), error: null, ...r })
    }
    let child
    try {
      child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      resolve({ status: null, signal: null, stdout, stderr, timedOut, ms: 0, error: String(e.message) })
      return
    }
    // Output past maxBytes is dropped, not buffered: a runaway child must not grow this process.
    child.stdout.on('data', (d) => {
      if (stdout.length < maxBytes) stdout += d
    })
    child.stderr.on('data', (d) => {
      if (stderr.length < maxBytes) stderr += d
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.on('error', (e) => done({ status: null, signal: null, error: String(e.message) }))
    child.on('close', (status, signal) => done({ status, signal }))
  })
}
