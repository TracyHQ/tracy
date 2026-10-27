// Async spawn that resolves like spawnSync's result ({ status, stdout, stderr }), so independent cases of
// a shell-driven test file can run side by side under `describe(..., { concurrency: N })`. spawnSync
// blocks the whole test process, which makes `concurrency` a no-op.
import { spawn } from 'node:child_process'

/** @returns {Promise<{ status: number | null, signal: string | null, stdout: string, stderr: string }>} */
export function sh(cmd, args, { input, encoding: _encoding, timeout, ...opts } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = timeout ? setTimeout(() => child.kill('SIGKILL'), timeout) : null
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d))
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d))
    child.stdin.on('error', () => {})
    child.stdin.end(input ?? '')
    child.on('error', reject)
    child.on('close', (status, signal) => {
      if (timer) clearTimeout(timer)
      resolve({ status, signal, stdout, stderr })
    })
  })
}
