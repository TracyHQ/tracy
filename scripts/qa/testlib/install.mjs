/**
 * Put the test library where a lane's tests import it from: a `lib/` folder that is the SIBLING of
 * the tests folder, so every test imports `../lib/<name>.mjs` both in the lane's PR folder
 * (`r/<runId>/<lane>/pr/<n>/{lib,tests}`) and on the `qa/daily-tests` branch (`lib/`, `pr-<n>/`).
 * The copy is made read-only; `libDigest` is the sha256 `result.json` and `rerun` record for it.
 *
 * Exports:
 *   TESTLIB_FILES: string[]                       // what goes into lib/ (this file is not one of them)
 *   installTestlib(destLibDir): { files: string[], sha256: string }
 *   libDigest(libDir): string                     // sha256 over (name, sha256(content)) of every lib file
 */
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const TESTLIB_FILES = ['stand.mjs', 'browser.mjs', 'chat.mjs', 'resolve.mjs', 'reporter.mjs']

const sha = (b) => createHash('sha256').update(b).digest('hex')

export function libDigest(libDir) {
  const names = readdirSync(libDir)
    .filter((n) => statSync(join(libDir, n)).isFile())
    .sort()
  const h = createHash('sha256')
  for (const n of names) h.update(`${n}\0${sha(readFileSync(join(libDir, n)))}\n`)
  return h.digest('hex')
}

export function installTestlib(destLibDir) {
  // A previous install left the folder read-only; its entries cannot be removed until it is not.
  if (existsSync(destLibDir)) chmodSync(destLibDir, 0o755)
  rmSync(destLibDir, { recursive: true, force: true })
  mkdirSync(destLibDir, { recursive: true })
  for (const f of TESTLIB_FILES) {
    copyFileSync(join(HERE, f), join(destLibDir, f))
    chmodSync(join(destLibDir, f), 0o444)
  }
  chmodSync(destLibDir, 0o555)
  return { files: [...TESTLIB_FILES], sha256: libDigest(destLibDir) }
}
