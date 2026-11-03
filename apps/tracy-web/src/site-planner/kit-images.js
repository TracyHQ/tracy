// The kit images of the site planner bench (ADR 0041, #302). The images are not in this repo: the kit pack zips them
// as `template-kit-<template>-<version>.zip`, an asset of the quickstart's GitHub release (lib/template-kit/reader.js).
// The first time a kit version is needed the zip is downloaded, every image the kit lists is checked against its
// sha256, and the images are cached on the server's disk; later runs reuse the cache, checked again on every use.
// A kit whose zip is missing or whose images do not match is refused with the reason, before any model call.
//
// Cache layout: <dir>/<kit ref>/<digest of the kit's image list>/<image path>, plus `verified.json`. A kit captured
// again lists other hashes, so it gets a new folder; a folder is written whole under a temporary name and renamed.
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { readReleases, RELEASES_REPO, releasesToken } from '../lib/quickstart-releases.js'
import { imagesDigest } from '../lib/template-kit/reader.js'

const API = 'https://api.github.com'
/** The JA Boxing zip is about 18 MB; a slow link must not hold a run start for ever. */
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000
const MEDIA_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
})
const HEX64 = /^[0-9a-f]{64}$/
const MARK = 'verified.json'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const refused = (code, reason) => ({ ok: false, code, reason })
const message = (e) => (e instanceof Error ? e.message : String(e))
/** At most five ids in a reason, then a count. */
const someIds = (ids) => `${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ` and ${ids.length - 5} more` : ''}`

/** The same slug the kit pack uses for the zip name (packages/cms/tracy-quickstart-tools/template-kit/lib/pack.mjs). */
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '')

/** The name of a kit's zip on its quickstart release, as the kit pack names it. */
export function kitZipName(doc) {
  const name = doc?.template?.name ?? doc?.quickstart?.slug ?? 'template'
  return `template-kit-${slug(name)}-${slug(doc?.quickstart?.version ?? 'x')}.zip`
}

/**
 * Where the images are cached: `site-planner-kit-images` in TRACY_READINESS_DIR (config.readinessDir, the folder the
 * release checks already cache their downloads in), or in the system's temporary folder when it is unset.
 */
export function kitImagesDirOf(config) {
  return path.join(config?.readinessDir ?? path.join(tmpdir(), 'tracy-readiness'), 'site-planner-kit-images')
}

/**
 * The images a kit lists, each with the media type its path names; or why the list cannot be served. Paths must stay
 * inside the cache folder, since they become file names there.
 */
function imageList(doc) {
  const images = Array.isArray(doc?.images) ? doc.images : []
  if (images.length === 0) return refused('SITE_PLANNER_KIT_IMAGE_PATH', 'the kit lists no images')
  const list = []
  const bad = []
  for (const image of images) {
    const p = typeof image?.path === 'string' ? image.path : ''
    const mediaType = MEDIA_TYPES[path.posix.extname(p).toLowerCase()]
    const clean =
      p !== '' &&
      !p.startsWith('/') &&
      !p.includes('\\') &&
      path.posix.normalize(p) === p &&
      !p.startsWith('..')
    const hash = String(image?.sha256 ?? '').toLowerCase()
    if (typeof image?.id !== 'string' || !clean || !mediaType || !HEX64.test(hash))
      bad.push(String(image?.id ?? p))
    else list.push({ id: image.id, path: p, sha256: hash, mediaType })
  }
  if (bad.length)
    return refused(
      'SITE_PLANNER_KIT_IMAGE_PATH',
      `the kit lists images that cannot be served (a path outside the kit, not a jpg, png or webp, or no sha256): ${someIds(bad)}`
    )
  return { ok: true, list }
}

/**
 * Kit images over a zip source.
 * @param {{ dir: string, fetchZip: (request: { release: string, name: string }) => Promise<
 *   { ok: true, bytes: Uint8Array } | { ok: false, code: string, reason: string }> }} deps
 */
export function createKitImages({ dir, fetchZip }) {
  /** One check or download per cache folder at a time in this process. */
  const inFlight = new Map()

  return {
    /**
     * Make the kit's images ready: from the cache when every cached image still matches, else from the zip.
     * @param {{ ref: string, release: string, doc: any }} kit as openKit returns it
     * @returns {Promise<{ ok: true, images: { open: (id: string) => Promise<any> } }
     *   | { ok: false, code: string, reason: string }>}
     */
    async ensure(kit) {
      const listed = imageList(kit?.doc)
      if (!listed.ok) return listed
      const folder = path.join(dir, slug(kit.ref), imagesDigest(listed.list).slice(0, 16))
      if (!inFlight.has(folder))
        inFlight.set(
          folder,
          prepare(kit, listed.list, folder).finally(() => inFlight.delete(folder))
        )
      const ready = await inFlight.get(folder)
      return ready.ok ? { ok: true, images: opener(listed.list, folder) } : ready
    }
  }

  async function prepare(kit, list, folder) {
    if (await cacheHolds(list, folder)) return { ok: true }
    await rm(folder, { recursive: true, force: true })
    const name = kitZipName(kit.doc)
    let got
    try {
      got = await fetchZip({ release: kit.release, name })
    } catch (e) {
      return refused('SITE_PLANNER_KIT_ZIP_UNREADABLE', `${name} could not be downloaded: ${message(e)}`)
    }
    if (!got?.ok) return got
    let files
    try {
      const wanted = new Set(list.map((i) => i.path))
      files = unzipSync(new Uint8Array(got.bytes), { filter: (f) => wanted.has(f.name) })
    } catch (e) {
      return refused('SITE_PLANNER_KIT_ZIP_INVALID', `${name} is not a readable zip: ${message(e)}`)
    }
    const missing = list.filter((i) => !files[i.path]).map((i) => i.id)
    if (missing.length)
      return refused(
        'SITE_PLANNER_KIT_IMAGE_MISSING',
        `${name} lacks ${missing.length} image(s) the kit lists: ${someIds(missing)}`
      )
    const mismatch = list.filter((i) => sha256(files[i.path]) !== i.sha256).map((i) => i.id)
    if (mismatch.length)
      return refused(
        'SITE_PLANNER_KIT_IMAGE_MISMATCH',
        `${mismatch.length} image(s) in ${name} do not match the sha256 the kit lists: ${someIds(mismatch)}`
      )
    await writeWhole(folder, list, files, { ref: kit.ref, zip: name })
    return { ok: true }
  }
}

/** Whether the cache folder holds every image of the list with its listed sha256. */
async function cacheHolds(list, folder) {
  try {
    await stat(path.join(folder, MARK))
    // eslint-disable-next-line no-await-in-loop -- one file at a time keeps memory flat.
    for (const image of list)
      if (sha256(await readFile(path.join(folder, image.path))) !== image.sha256) return false
    return true
  } catch {
    return false
  }
}

/** Write the checked images under a temporary name, then rename the folder into place. */
async function writeWhole(folder, list, files, about) {
  const parent = path.dirname(folder)
  const incoming = path.join(parent, `.incoming-${randomBytes(6).toString('hex')}`)
  try {
    for (const image of list) {
      const file = path.join(incoming, image.path)
      // eslint-disable-next-line no-await-in-loop -- a hundred small files, written in order.
      await mkdir(path.dirname(file), { recursive: true })
      // eslint-disable-next-line no-await-in-loop
      await writeFile(file, files[image.path])
    }
    await writeFile(
      path.join(incoming, MARK),
      `${JSON.stringify({ ...about, images: list.length, at: new Date().toISOString() })}\n`
    )
    await rename(incoming, folder).catch(async (e) => {
      // Another process wrote the same folder first: its images passed the same check.
      if (!(await cacheHolds(list, folder))) throw e
    })
  } finally {
    await rm(incoming, { recursive: true, force: true })
  }
}

/** open(id): one cached image as a tool result (text plus the image), or an error the planner can read. */
function opener(list, folder) {
  const byId = new Map(list.map((i) => [i.id, i]))
  return {
    async open(id) {
      const image = byId.get(id)
      if (!image)
        return JSON.stringify({
          error: 'UNKNOWN_IMAGE',
          id,
          detail:
            'No kit image has this id. Use an id a page or a block lists under "images", such as "page-home-1440".'
        })
      let bytes
      try {
        bytes = await readFile(path.join(folder, image.path))
      } catch {
        bytes = null
      }
      if (!bytes || sha256(bytes) !== image.sha256)
        return JSON.stringify({
          error: 'IMAGE_UNAVAILABLE',
          id,
          detail: 'This image could not be read from the server cache. Continue from the kit text.'
        })
      return {
        text: JSON.stringify({ id, path: image.path, mediaType: image.mediaType, bytes: bytes.length }),
        images: [{ mediaType: image.mediaType, base64: bytes.toString('base64') }]
      }
    }
  }
}

/**
 * The kit zip from its quickstart release, the way Tracy already downloads release assets: the release row from
 * `quickstart_releases` (ADR 0017, the table is the answer), the asset by id, with the releases token.
 * @param {{ pool: any, config: any, fetchImpl?: typeof fetch }} deps
 */
export function releaseKitZip({ pool, config, fetchImpl = fetch }) {
  return async ({ release, name }) => {
    const rows = await readReleases(pool, { includeArchived: true })
    const row = rows.find((r) => r.tag === release)
    if (!row)
      return refused(
        'SITE_PLANNER_KIT_ZIP_MISSING',
        `the release ${release} is not among the releases Tracy has read from ${RELEASES_REPO}`
      )
    const asset = (row.assets ?? []).find((a) => a?.name === name)
    if (!asset || asset.id == null)
      return refused('SITE_PLANNER_KIT_ZIP_MISSING', `the release ${release} has no asset ${name}`)
    const { token, reason } = await releasesToken(config, fetchImpl)
    if (!token)
      return refused(
        'SITE_PLANNER_KIT_ZIP_UNREADABLE',
        reason ?? 'This deployment has no credential for the releases repository.'
      )
    let response
    try {
      response = await fetchImpl(`${API}/repos/${RELEASES_REPO}/releases/assets/${asset.id}`, {
        headers: {
          accept: 'application/octet-stream',
          authorization: `Bearer ${token}`,
          'user-agent': 'tracy-web',
          'x-github-api-version': '2022-11-28'
        },
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
      })
    } catch (e) {
      return refused('SITE_PLANNER_KIT_ZIP_UNREADABLE', `GitHub did not answer for ${name}: ${message(e)}`)
    }
    if (!response.ok)
      return refused('SITE_PLANNER_KIT_ZIP_UNREADABLE', `GitHub answered ${response.status} for ${name}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const stated = typeof asset.digest === 'string' ? asset.digest.match(/^sha256:([0-9a-f]{64})$/i) : null
    if (stated && sha256(bytes) !== stated[1].toLowerCase())
      return refused('SITE_PLANNER_KIT_ZIP_INVALID', `${name} does not match the digest GitHub states for it`)
    return { ok: true, bytes }
  }
}

/** The kit images of this server: the release zips, cached in kitImagesDirOf(config). Build one per process. */
export function kitImagesFor({ pool, config, fetchImpl = fetch }) {
  return createKitImages({
    dir: kitImagesDirOf(config),
    fetchZip: releaseKitZip({ pool, config, fetchImpl })
  })
}
