/**
 * Where the Template Customization Question Readiness check reads a release from. One interface,
 * two adapters, no network:
 *
 *   { tag, where, names(): Promise<string[]>, read(name): Promise<Buffer | null> }
 *
 * - `localPackSource(root, slug, cms, { namespace })`: a pack under `TRACY_LOCAL_RELEASES_DIR`
 *   (`<root>/<slug>/<cms>/`, or `<root>/quickstart/<slug>/<cms>/` with `namespace: 'quickstart'`, the
 *   layouts `local-releases.js` reads), tagged `local/` plus that path.
 * - `releaseCacheSource(cacheDir, tag)`: the assets of a published release, already downloaded into
 *   `<cacheDir>/<tag with "/" as "_">/` (what `gh release download <tag> -D <that dir>` writes).
 *   A cache may hold only some assets; a rule that needs one that is absent says so.
 * - `directoryReleaseSource(dir, { tag })`: any folder of release files, the shape both build on.
 *
 * Tests pass their own object of the same shape. Reading a release off GitHub is not done here: a
 * caller downloads into a cache directory first, so the check itself never needs a token.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { LOCAL_TAG_NAMESPACE } from '../local-releases.js'

/**
 * @typedef {{
 *   tag: string | null,
 *   where: string,
 *   names: () => Promise<string[]>,
 *   read: (name: string) => Promise<Buffer | null>
 * }} ReleaseSource
 */

/** One asset name: a plain file name, never a path out of the folder. */
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/

/**
 * The release files in one folder. Regular files only: a symbolic link could name a file outside
 * the folder (the same reason `local-releases.js` gives).
 * @param {string} dir
 * @param {{ tag?: string | null }} [opts]
 * @returns {ReleaseSource}
 */
export function directoryReleaseSource(dir, { tag = null } = {}) {
  const where = path.resolve(dir)
  /** @type {Promise<string[]> | null} */
  let listing = null
  const names = () => {
    listing ??= readdir(where, { withFileTypes: true }).then((entries) =>
      entries
        .filter((e) => e.isFile() && ASSET_NAME.test(e.name))
        .map((e) => e.name)
        .sort()
    )
    return listing
  }
  return {
    tag,
    where,
    names,
    async read(name) {
      if (!ASSET_NAME.test(name) || !(await names()).includes(name)) return null
      return readFile(path.join(where, name))
    }
  }
}

/**
 * A pack under `TRACY_LOCAL_RELEASES_DIR`.
 * @param {string} root the value of `TRACY_LOCAL_RELEASES_DIR`
 * @param {string} slug
 * @param {string} cms the pack folder (`j6`, `wp7`, `emdash`…)
 * @returns {ReleaseSource}
 */
export function localPackSource(root, slug, cms, { namespace = '' } = {}) {
  for (const segment of [slug, cms, ...(namespace ? [namespace] : [])])
    if (!ASSET_NAME.test(segment)) throw new Error(`"${segment}" is not a pack folder name`)
  // A JoomlArt pack sits one level deeper, spelled like its release tag (`quickstart/<slug>/<cms>`),
  // so its tag maps to the published release's contract the way local-releases.js reads it.
  const parts = namespace ? [namespace, slug, cms] : [slug, cms]
  return directoryReleaseSource(path.join(root, ...parts), {
    tag: `${LOCAL_TAG_NAMESPACE}${parts.join('/')}`
  })
}

/**
 * The cache folder a release's assets are downloaded into: `quickstart/ja-essence/j6` →
 * `<cacheDir>/quickstart_ja-essence_j6`.
 * @param {string} cacheDir
 * @param {string} tag
 */
export function releaseCacheDir(cacheDir, tag) {
  const folder = tag.replaceAll('/', '_')
  if (!ASSET_NAME.test(folder)) throw new Error(`"${tag}" is not a release tag`)
  return path.join(cacheDir, folder)
}

/**
 * A published release, read from its download cache.
 * @param {string} cacheDir
 * @param {string} tag
 * @returns {ReleaseSource}
 */
export function releaseCacheSource(cacheDir, tag) {
  return directoryReleaseSource(releaseCacheDir(cacheDir, tag), { tag })
}

/**
 * One asset as text, or null when the release does not carry it.
 * @param {ReleaseSource} source
 * @param {string} name
 */
export async function readText(source, name) {
  const bytes = await source.read(name)
  return bytes === null ? null : bytes.toString('utf8')
}
