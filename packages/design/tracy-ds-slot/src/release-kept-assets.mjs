/**
 * The release assets a new version keeps as the release serves them: one file for every version of the
 * release, unchanged by a stylesheet-only build, that the local release folder still needs so the checks run
 * on it see the release as a site will be built from it. The Customize check (REL-2, PAGE-*) reads
 * `tracy_site_pages.json` from the folder: a build without it failed five rules while the release itself
 * carried the file (TEXT-1 batch 3, 21/10/2026). Nothing here uploads: the file stays as published.
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const KEPT_ASSETS = Object.freeze(['tracy_site_pages.json'])

/**
 * Each kept asset fetched into `dir`; the ones the release has.
 * @param {(file: string, dir: string) => void} fetch  writes `<dir>/<file>`, throws when the release has none
 * @param {string} dir  the new version's release folder
 * @returns {string[]}
 */
export function keepAssets(fetch, dir) {
  const kept = []
  for (const file of KEPT_ASSETS) {
    // The folder can be reused across builds: a copy left by an earlier build is not this release's.
    rmSync(join(dir, file), { force: true })
    try {
      fetch(file, dir)
    } catch {
      rmSync(join(dir, file), { force: true })
      continue
    }
    if (existsSync(join(dir, file))) kept.push(file)
  }
  return kept
}
