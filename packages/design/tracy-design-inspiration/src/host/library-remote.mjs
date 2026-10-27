/**
 * The 152 design systems from ONE place: the public page's static files
 * (`cowork.tracy.ai/design-inspiration/{data,systems}/…`, cut from `vendor/tracy/od-design-system` by
 * `packages/web/tracy-design-page/scripts/build-assets.mjs`), read over HTTP and kept on disk
 * under the vendor commit the page's manifest names.
 *
 * WHY. Until 08/09 every lane carried its own copy of the library in the image, and the public
 * page carried another: one fix to a design system meant a new image, an update of every lane,
 * and a deploy of the Worker — three roads, and they drifted (tasks/todo-thu-vien-mot-cho.md).
 * With the page as the only serving point, a fix is `build-assets` + `deploy cowork-web`, and
 * every lane sees it on its next catalog open. The image keeps its copy only as the road back
 * when the lane has no network on first boot (`loadLibrary` in index.ts falls through to it).
 *
 * Cache layout: `<cacheDir>/<commit>/data/catalog.json`, `<cacheDir>/<commit>/systems/<id>/<file>`,
 * `<cacheDir>/current` = the last commit the manifest named. A file is fetched once per commit;
 * a 404 is not cached (the next open may ask again — it is one request). Old commits are not
 * swept here; `sweepOldCommits` does that on request, keeping the two newest.
 */
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ARTIFACT_TYPES, SYSTEM_FILES, slimCatalog } from './gallery.mjs'

/**
 * The files of a system the library serves — the host's closed list, `slots.json`, and the measured
 * slot map of each prebuilt artifact (`artifact-slots/<kind>.json`).
 */
export const LIBRARY_FILES = Object.freeze([
  ...Object.keys(SYSTEM_FILES),
  'slots.json',
  ...ARTIFACT_TYPES.map((kind) => `artifact-slots/${kind}.json`)
])

/** `$DSH_HOME/design-library` — beside the profiles, so a lane keeps it across image updates. */
export function defaultLibraryCacheDir() {
  return path.join(process.env.DSH_HOME ?? os.homedir(), 'design-library')
}

const ID_RE = /^[a-z0-9][a-z0-9.-]*$/
const COMMIT_RE = /^[0-9a-f]{6,40}$/
const FETCH_TIMEOUT_MS = 15_000

/**
 * @typedef {object} RemoteLibrary
 * @property {string} url
 * @property {string} commit
 * @property {boolean} offline true when the manifest could not be read and the disk answered instead
 * @property {ReturnType<typeof slimCatalog>} systems
 * @property {Set<string>} ids
 * @property {(id: string, file: string) => Promise<Buffer | null>} read one file of one system
 * @property {(type: string) => Promise<unknown[]>} artifactSlots the shared slot map of one artifact kind
 */

/**
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Buffer | null>} the body, or null on any status but 200 / any failure.
 */
async function get(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: '*/*' }
    })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Read a cached file, or fetch it, write it, and return it. `null` when neither side has it.
 * @param {{ url: string, dir: string, fetch: typeof fetch }} lib
 * @param {string} rel path under both the page and the cache dir
 * @param {string} [query] appended to the URL — `?v=<commit>` so a CDN keeps a versioned copy
 */
async function cachedFile(lib, rel, query = '') {
  const target = path.join(lib.dir, rel)
  try {
    return await fs.readFile(target)
  } catch {
    // not on disk yet
  }
  const body = await get(`${lib.url}/${rel}${query}`, lib.fetch)
  if (body === null) return null
  await fs.mkdir(path.dirname(target), { recursive: true })
  // Write beside, then rename: a reader never sees a half-written file. The temp name is unique per
  // write: two readers of the same file on a cold cache fetch and write it at once.
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await fs.writeFile(tmp, body)
    await fs.rename(tmp, target)
  } catch (error) {
    await fs.rm(tmp, { force: true })
    throw error
  }
  return body
}

/**
 * @param {Buffer | null} body
 * @returns {{ vendorCommit?: unknown } | null}
 */
function manifestOf(body) {
  if (body === null) return null
  try {
    const parsed = JSON.parse(body.toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Open the library the page serves at `url`, caching under `cacheDir`.
 *
 * @param {{ url: string, cacheDir: string, fetch?: typeof fetch }} options
 * @returns {Promise<RemoteLibrary | null>} null only when there is no network AND nothing on disk.
 */
export async function openRemoteLibrary({ url, cacheDir, fetch: fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '')
  const manifest = manifestOf(await get(`${base}/data/manifest.json`, fetchImpl))
  let commit = typeof manifest?.vendorCommit === 'string' ? manifest.vendorCommit : null
  let offline = false
  if (commit === null || !COMMIT_RE.test(commit)) {
    // No manifest: the last commit the page named, if this disk ever saw one.
    try {
      const last = (await fs.readFile(path.join(cacheDir, 'current'), 'utf8')).trim()
      if (!COMMIT_RE.test(last)) return null
      commit = last
      offline = true
    } catch {
      return null
    }
  }
  const dir = path.join(cacheDir, commit)
  const lib = { url: base, dir, fetch: fetchImpl }
  const query = `?v=${commit}`
  const catalogBody = await cachedFile(lib, path.join('data', 'catalog.json'), query)
  if (catalogBody === null) return null
  let catalog
  try {
    catalog = JSON.parse(catalogBody.toString('utf8'))
  } catch {
    return null
  }
  // The page's catalog rows already carry `dark` (build-assets folded dark.json in); slimCatalog
  // with no dark map would read every row as safe, so keep the row's own verdict.
  const systems = slimCatalog(catalog).map((row, i) => {
    const raw = catalog.systems?.[i]
    return raw && typeof raw.dark === 'boolean' ? { ...row, dark: raw.dark } : row
  })
  if (!offline) {
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(path.join(cacheDir, 'current'), `${commit}\n`)
  }
  const ids = new Set(systems.map((s) => s.id))

  return {
    url: base,
    commit,
    offline,
    systems,
    ids,
    async read(id, file) {
      if (!ids.has(id) || !ID_RE.test(id) || !LIBRARY_FILES.includes(file)) return null
      return cachedFile(lib, path.join('systems', id, file), query)
    },
    async artifactSlots(type) {
      if (!ARTIFACT_TYPES.includes(type)) return []
      const body = await cachedFile(lib, path.join('data', 'artifact-slots', `${type}.json`), query)
      if (body === null) return []
      try {
        const parsed = JSON.parse(body.toString('utf8'))
        return Array.isArray(parsed?.slots) ? parsed.slots : []
      } catch {
        return []
      }
    }
  }
}

/**
 * Remove every cached commit but the `keep` newest by mtime. Never removes `current`'s commit.
 * @param {string} cacheDir
 * @param {number} [keep]
 * @returns {Promise<string[]>} the commits removed
 */
export async function sweepOldCommits(cacheDir, keep = 2) {
  let entries
  try {
    entries = await fs.readdir(cacheDir, { withFileTypes: true })
  } catch {
    return []
  }
  let current = null
  try {
    current = (await fs.readFile(path.join(cacheDir, 'current'), 'utf8')).trim()
  } catch {
    // no current
  }
  const commits = []
  for (const e of entries) {
    if (!e.isDirectory() || !COMMIT_RE.test(e.name)) continue
    const stat = await fs.stat(path.join(cacheDir, e.name))
    commits.push({ name: e.name, at: stat.mtimeMs })
  }
  commits.sort((a, b) => b.at - a.at)
  const removed = []
  for (const c of commits.slice(keep)) {
    if (c.name === current) continue
    await fs.rm(path.join(cacheDir, c.name), { recursive: true, force: true })
    removed.push(c.name)
  }
  return removed
}
