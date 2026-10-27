// Shared by the selftests (not itself a test: the glob is test/*.test.mjs).
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = process.env.QA_FLOWS_ARTIFACT_ROOT
if (ROOT) mkdirSync(ROOT, { recursive: true })
const made = []

/** A scratch directory under the artifact root (or the OS temp), removed when the process ends. */
export function tmpDir(name) {
  const dir = mkdtempSync(path.join(ROOT ?? os.tmpdir(), `${name}-`))
  made.push(dir)
  return dir
}
process.on('exit', () => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

/** A fake `docker`/`exec`-style runner: `script(cmd, args, opts)` returns a partial result. */
export function fakeRun(script) {
  const calls = []
  const fn = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, opts })
    const r = (await script(cmd, args, opts)) ?? {}
    return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, ms: 1, ...r }
  }
  fn.calls = calls
  return fn
}
/** Same, for the stand's Docker interface (`docker(args, opts)`). */
export function fakeDocker(script) {
  const calls = []
  const fn = async (args, opts = {}) => {
    calls.push(args)
    const r = (await script(args, opts)) ?? {}
    return { code: 0, stdout: '', stderr: '', ...r }
  }
  fn.calls = calls
  return fn
}
