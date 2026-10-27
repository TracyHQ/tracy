// Executable stubs that are written and run ONCE per test file, then linked into each case.
//
// macOS scans every freshly written executable on its first run (~100 ms, serialised system-wide, so
// `concurrency` does not hide it): a shell-driven test that writes its own `docker` stub per case pays
// that once per case. A symlink to a stub that already ran is free (measured 100 ms → 3 ms), and a stub
// that reads its per-case values from the environment behaves the same for every case.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const DIR = mkdtempSync(path.join(tmpdir(), 'warm-stub-'))
process.on('exit', () => rmSync(DIR, { recursive: true, force: true }))

/**
 * Write `body` as an executable once, run it once (with `warmEnv`, args `warmArgs`) so the scan is paid
 * here, and return its path.
 */
export function warmStub(name, body, { warmEnv = {}, warmArgs = [] } = {}) {
  const file = path.join(DIR, name)
  writeFileSync(file, body)
  chmodSync(file, 0o755)
  spawnSync(file, warmArgs, { env: { ...process.env, ...warmEnv }, stdio: 'ignore' })
  return file
}

/** Make `dest` a link to a warmed stub (a copy would be a fresh file and be scanned again). */
export function linkStub(stub, dest) {
  symlinkSync(stub, dest)
}

const TRAMPOLINES = {}

/**
 * An executable with a per-case body, without a per-case executable: the body is written as DATA
 * (`<file>.body`, never scanned) and `file` is a link to a warmed trampoline that runs it. `$0` inside
 * the body is `<file>.body`; nothing else differs from running the script directly.
 * @param {string} file where the executable should appear
 * @param {string} body the script, shebang first (`#!/bin/sh` or `#!/usr/bin/env bash`)
 */
export function scriptStub(file, body) {
  const shell = /^#!\s*(\/usr\/bin\/env\s+bash|\/bin\/bash)/.test(body) ? 'bash' : 'sh'
  TRAMPOLINES[shell] ??= warmStub(
    `trampoline-${shell}`,
    `#!/bin/sh\nexec ${shell === 'bash' ? '/usr/bin/env bash' : '/bin/sh'} "$0.body" "$@"\n`
  )
  writeFileSync(`${file}.body`, body)
  rmSync(file, { force: true })
  linkStub(TRAMPOLINES[shell], file)
}
