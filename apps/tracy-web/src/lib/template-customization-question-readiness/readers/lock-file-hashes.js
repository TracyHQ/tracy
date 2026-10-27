/**
 * A presentation lock's `files` map against the bytes of a release archive, for STAB-6:
 * `compared(locked, actual)` names what differs; `againstThemeZips` reads a WordPress lock against
 * the theme zips the release attaches when the webroot is not carried (the server downloads the
 * theme zip, not the webroot).
 */
import { zipHashes } from './archive-file-hashes.js'
import { counted } from './rule-findings.js'
import { themeZipsInOrder } from './theme-zips.js'

/** Files T4 writes itself (contracts README): never in a lock. */
const GENERATED = /^media\/t4\/(optimize\/|css\/\d+(?:-sub)?\.css$)/

/** What differs between the lock's `files` and the hashes `actual` of an archive. */
export function compared(
  /** @type {Record<string, string>} */ locked,
  /** @type {Map<string, string>} */ actual
) {
  const changed = []
  const absent = []
  for (const [file, hash] of Object.entries(locked)) {
    if (GENERATED.test(file)) continue
    const have = actual.get(file)
    if (have === undefined) absent.push(file)
    else if (have !== hash) changed.push(file)
  }
  const extra = [...actual.keys()].filter(
    (f) => !(f in locked) && !GENERATED.test(f) && /\.(php|js|mjs)$/.test(f)
  )
  const problems = []
  if (changed.length)
    problems.push(
      `${counted(changed.length, 'locked file differs', 'locked files differ')} from the release (${changed.slice(0, 4).join(', ')})`
    )
  if (absent.length)
    problems.push(
      `${counted(absent.length, 'locked file is', 'locked files are')} not in the release (${absent.slice(0, 4).join(', ')})`
    )
  if (extra.length)
    problems.push(
      `${counted(extra.length, 'code file of the release is', 'code files of the release are')} not in the lock (${extra.slice(0, 4).join(', ')})`
    )
  return problems
}

/**
 * A WordPress lock's `files` are the theme folder only (`fileRoots` `wp-content/themes/<theme>`), and
 * the release attaches that folder as a theme zip (~1 MB) beside the webroot (50-60 MB), which the
 * server does not download. Measured 12/10/2026: the theme zip and the webroot's theme folder are
 * the same bytes (JA Essence 1.0.17: 136 files; Tracy Base 1.1.3 with its 1.1.6 zip: 117), the zip
 * adding only `tracy-release.json`. So the lock is read against the theme zips: one that matches
 * every locked file decides a pass. When none does, the webroot may still carry another cut of the
 * theme than the zips, so only the webroot decides: the part stays open, with what differed.
 * @returns {Promise<{ problems: string[] } | null>} null when no zip holds the theme
 */
export async function againstThemeZips(
  /** @type {import('../index.js').RuleContext} */ context,
  /** @type {string[]} */ roots,
  /** @type {Record<string, string>} */ locked,
  /** @type {string[]} */ open
) {
  const folders = roots.map((r) => /^wp-content\/themes\/([^/]+)\/$/.exec(r)?.[1]).filter(Boolean)
  if (!folders.length || folders.length !== roots.length) return null
  const names = await context.source.names()
  const tried = []
  for (const zip of themeZipsInOrder(names, folders[0], context.release.version)) {
    // eslint-disable-next-line no-await-in-loop -- zips are opened one at a time, in their reading order.
    const bytes = await context.source.read(zip)
    if (!bytes) continue
    const actual = new Map()
    for (const [name, hash] of zipHashes(bytes, (n) => folders.some((f) => n.startsWith(`${f}/`))))
      actual.set(`wp-content/themes/${name}`, hash)
    if (actual.size === 0) continue
    const problems = compared(locked, actual)
    if (problems.length === 0) {
      open.push(`the webroot is not carried: the lock's file hashes were compared with the theme zip ${zip}`)
      return { problems }
    }
    tried.push(`${zip}: ${problems.join('; ')}`)
  }
  if (!tried.length) return null
  open.push(
    `the webroot is not carried and no theme zip matches the lock (${tried.join(' | ')}): only the webroot tells whether the lock is this release`
  )
  return { problems: [] }
}
