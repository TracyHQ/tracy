/**
 * 🔒 A SITE FILE AT MTIME 0 GETS THE TIME NOW, ONCE, WHEN tracy-host STARTS.
 *
 * The Joomla quickstart tarballs are packed reproducibly, every file at mtime 0, and until #430 the
 * webroot was extracted keeping it. PHP's OPcache (`validate_timestamps=On`) never caches a script
 * whose timestamp is 0, so every request to such a site compiled Joomla again. Measured 27/09/2026 on
 * a clone of a Business j6 site: 13,824 files at 0, 57 scripts cached (6,010 misses to 749 hits);
 * the same files touched — boot 1.2–1.7 s → 0.3–0.4 s, home page 0.8–1.2 s → 0.43 s, a contract apply
 * 3.8 s → 1.6–2.1 s. `provision.sh`/`restore.sh` now extract with `tar -xmf`; this reaches the sites
 * that were already built, on every host, the next time tracy-host is deployed there.
 *
 * Only the modification time of a regular file older than 1971 moves; content, owner and mode do
 * not, symlinks are not followed, and a file already at a real time is left alone — so a second run
 * finds nothing. It runs in the background after the server listens, one site at a time, and never
 * fails the process: an unreadable folder is skipped. `TRACY_HOST_REFRESH_MTIMES=0` turns it off.
 */
import { lstat, opendir, readdir, utimes } from 'node:fs/promises'
import path from 'node:path'

/** Anything before this is "no time at all" — an archive's placeholder, never a real edit. */
export const ZERO_MTIME_BEFORE_MS = Date.UTC(1971, 0, 1)

/**
 * A site folder name, as the fleet names them (`<label>`); anything else under the root is not a
 * site. Shared with the content identity pass (`content-identity.js`), which walks the other root.
 */
export const SITE_LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/

/**
 * @param {{ sitesRoot: string, log?: { log: (m: string) => void, warn: (m: string) => void }, now?: () => Date }} input
 * @returns {Promise<{ sites: number, files: number }>}
 */
export async function refreshZeroMtimes({ sitesRoot, log = console, now = () => new Date() }) {
  let entries
  try {
    entries = await readdir(sitesRoot, { withFileTypes: true })
  } catch {
    return { sites: 0, files: 0 }
  }
  let sites = 0
  let files = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !SITE_LABEL.test(entry.name)) continue
    const touched = await touchZeroMtimes(path.join(sitesRoot, entry.name, '.webroot'), now())
    if (touched > 0) {
      sites++
      files += touched
      log.log(
        `[host] ${entry.name}: ${touched} file(s) at mtime 0 given the time now (OPcache caches none at 0)`
      )
    }
  }
  return { sites, files }
}

/**
 * @param {string} dir
 * @param {Date} when
 * @returns {Promise<number>}
 */
async function touchZeroMtimes(dir, when) {
  let handle
  try {
    handle = await opendir(dir)
  } catch {
    return 0
  }
  let touched = 0
  for await (const item of handle) {
    const file = path.join(dir, item.name)
    if (item.isSymbolicLink()) continue
    if (item.isDirectory()) {
      touched += await touchZeroMtimes(file, when)
      continue
    }
    if (!item.isFile()) continue
    const stat = await lstat(file).catch(() => null)
    if (stat === null || stat.mtimeMs >= ZERO_MTIME_BEFORE_MS) continue
    const done = await utimes(file, stat.atime, when).then(
      () => true,
      () => false
    )
    if (done) touched++
  }
  return touched
}
