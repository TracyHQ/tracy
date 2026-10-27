// Scratch directories for fixtures, mutants and selftests. They live under the task artifact
// directory (QA_INFRA_ARTIFACT_DIR), the run's outDir, or `qa-results/infra-scratch` in the repo
// (gitignored by W0) — never in a shared system temp location. Every directory handed out is
// checked: no component of the base may be a symlink, so nothing created here can resolve outside it.
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { REPO, assertNoUserSymlinks, containedPath } from './harness.mjs'
import { readBytesSync } from '../../../lib/bounded-reader.mjs'

let runBase

/** run() points scratch at <outDir>/scratch for the duration of a run. */
export function setScratchBase(dir) {
  runBase = dir ? path.join(path.resolve(dir), 'scratch') : undefined
}

export function scratchBase() {
  const env = process.env.QA_INFRA_ARTIFACT_DIR
  if (env) return path.join(path.resolve(env), 'scratch')
  return runBase ?? path.join(REPO, 'qa-results', 'infra-scratch')
}

export function scratchDir(prefix) {
  const base = scratchBase()
  assertNoUserSymlinks(base)
  mkdirSync(base, { recursive: true })
  assertNoUserSymlinks(base)
  if (lstatSync(base).isSymbolicLink()) throw new Error(`scratch base is a symlink, refused: ${base}`)
  const dir = mkdtempSync(path.join(base, prefix))
  ownedScratch.add(dir)
  return dir
}

/** Directories this process created, so a cleanup removes exactly those. */
const ownedScratch = new Set()

/** Fingerprints of the scratch trees created (and removed) since the last `takeObservedFixtures`. */
let observed = []

/** Hash a scratch tree: every entry's relative name, type, mode and (for files) content bytes. */
function fingerprint(dir) {
  const hash = createHash('sha256')
  let entries = 0
  const visit = (at) => {
    for (const name of readdirSync(at).sort()) {
      const full = path.join(at, name)
      const info = lstatSync(full)
      entries += 1
      const kind = info.isSymbolicLink() ? 'l' : info.isDirectory() ? 'd' : info.isFile() ? 'f' : 's'
      hash.update(`${kind} ${(info.mode & 0o777).toString(8)} ${path.relative(dir, full)}\n`)
      if (kind === 'd') visit(full)
      else if (kind === 'f' && info.size <= 1_000_000) hash.update(readBytesSync(full))
    }
  }
  try {
    visit(dir)
  } catch (error) {
    return { sha256: `unreadable:${error.code ?? error.message}`, entries }
  }
  return { sha256: hash.digest('hex'), entries }
}

/** The fixtures a case actually built at run time (bytes included), then forget them. */
export function takeObservedFixtures() {
  const taken = observed
  observed = []
  return taken
}

/** Remove one scratch directory this process created (and nothing else). */
export function removeScratch(dir) {
  const resolved = path.resolve(dir)
  if (!ownedScratch.has(resolved)) throw new Error(`not a scratch directory of this run, refused: ${dir}`)
  containedPath(path.dirname(resolved), path.basename(resolved))
  observed.push({ name: path.basename(resolved), ...fingerprint(resolved) })
  rmSync(resolved, { recursive: true, force: true })
  ownedScratch.delete(resolved)
}
