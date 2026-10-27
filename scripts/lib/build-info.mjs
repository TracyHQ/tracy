/**
 * THE INCREMENTAL-BUILD RECORDS OF ANOTHER dsh ARE NOT THIS dsh's.
 *
 * `tsc -b` keeps a `*.tsbuildinfo` beside each project's output and trusts it on the next build:
 * a source whose recorded hash still matches is not re-checked, and its declarations are taken from
 * the record. A self-hosted runner keeps one checkout for every branch, so a build of a newer dsh
 * (a PR moving the submodule) leaves its records behind, and the next build at the pinned commit
 * type-checks the old tests against the NEW declarations. Measured 26/09/2026 on runners
 * j-general-demo-01 and j-download-02: `build:lib` failed on 20 errors in `apps/desktop/tests`
 * (TS2554 "Expected 2 arguments, but got 1" …), records written 15:38–15:50 by the dsh 0.1.7 PR,
 * the submodule itself clean at the pinned commit — every PR's CI red on those runners.
 *
 * Removing the records costs one full type-check, and `build-dsh.mjs` only builds at all when its
 * stamp says this checkout does not already hold this dsh's output.
 */
import { readdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Remove every `*.tsbuildinfo` under `root`, leaving `node_modules` unwalked.
 * @param {string} root
 * @returns {string[]} the removed files, relative to `root`
 */
export function removeBuildInfo(root) {
  const removed = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.tsbuildinfo')) {
        rmSync(path, { force: true })
        removed.push(relative(root, path))
      }
    }
  }
  walk(root)
  return removed
}
