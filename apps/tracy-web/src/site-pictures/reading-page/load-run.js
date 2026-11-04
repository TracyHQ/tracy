// Reads a folder written by "site-pictures-bench get" for the picture reading page (ADR 0043, #341), and finds the
// pictures beside it: the run's own files (files/), the owner's originals (a folder of photos named by sha256, the
// one the bench run was given) and the kit's demo pictures (a folder of images named after the frame ids). The only
// file system part of the page; the model and the render after it are pure. A missing file is a null, never a throw.
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { blockImageFinder } from '../../site-writer/reading-page/load-run.js'

async function readJson(file, required) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (!required && error.code === 'ENOENT') return null
    throw new Error(`cannot read ${path.basename(file)} in the run folder: ${error.message}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${path.basename(file)} is not valid JSON`)
  }
}

const latestVersion = (names, stem) =>
  names.reduce(
    (best, n) => Math.max(best, Number(new RegExp(`^${stem}-v(\\d+)\\.json$`).exec(n)?.[1] ?? 0)),
    0
  )

/** plan.json, the final manifest (site-pictures.json, else the newest pictures-vN.json), brief.json and run.json. */
export async function loadRunFolder(dir) {
  const names = await readdir(dir).catch((e) => {
    throw new Error(`cannot open the run folder: ${e.message}`)
  })
  const plan = await readJson(path.join(dir, 'plan.json'), true)
  const brief = await readJson(path.join(dir, 'brief.json'), false)
  const run = await readJson(path.join(dir, 'run.json'), false)
  const version = latestVersion(names, 'pictures')
  const manifest =
    (await readJson(path.join(dir, 'site-pictures.json'), false)) ??
    (version ? await readJson(path.join(dir, `pictures-v${version}.json`), true) : null)
  if (!manifest) throw new Error('the run folder has no site-pictures.json and no pictures-vN.json')
  return { plan, brief, run, manifest }
}

/** The template kit JSON and its frames (blocks[].frames[]) by id; no kit gives none. */
async function readKit(kitFile) {
  const frames = new Map()
  if (!kitFile) return { kit: null, frames }
  const kit = await readJson(kitFile, true)
  for (const b of Array.isArray(kit?.blocks) ? kit.blocks : [])
    for (const f of Array.isArray(b?.frames) ? b.frames : [])
      if (f && typeof f.id === 'string' && !frames.has(f.id)) frames.set(f.id, f)
  return { kit, frames }
}

// The kit's shots (page, block and body images) by image id: a file named after the id in the kit images folder,
// else the path the kit lists beside its JSON. Only files that exist, each with its size.
async function kitShots(kit, kitFile, kitImagesDir) {
  const shots = new Map()
  const listed = new Map(
    (Array.isArray(kit?.images) ? kit.images : [])
      .filter((i) => i && typeof i.id === 'string' && typeof i.path === 'string')
      .map((i) => [i.id, i.path])
  )
  const ids = new Set(listed.keys())
  for (const x of [...(kit?.pages ?? []), ...(kit?.blocks ?? [])])
    if (typeof x?.images?.['1440'] === 'string') ids.add(x.images['1440'])
  const kitDir = kitFile ? path.dirname(path.resolve(kitFile)) : null
  for (const id of ids) {
    if (!id.endsWith('-1440')) continue
    const candidates = [
      ...(kitImagesDir ? ['.jpg', '.png', '.webp'].map((x) => path.join(kitImagesDir, `${id}${x}`)) : []),
      // A listed path outside the kit folder is not read.
      listed.has(id) && kitDir && path.resolve(kitDir, listed.get(id)).startsWith(`${kitDir}${path.sep}`)
        ? path.resolve(kitDir, listed.get(id))
        : null
    ].filter(Boolean)
    for (const file of candidates)
      if (await isFile(file)) {
        const size = await sizeOf(file)
        if (size) shots.set(id, { file, ...size })
        break
      }
  }
  return shots
}

/** The pixel size of an image file, or null. */
async function sizeOf(file) {
  try {
    const m = await sharp(file).metadata()
    return m.width && m.height ? { width: m.width, height: m.height } : null
  } catch {
    return null
  }
}

const isFile = (file) =>
  stat(file).then(
    (s) => s.isFile(),
    () => false
  )

/**
 * The finders of the page: each returns { file, width, height } (absolute file) or null when the picture is not there.
 * @param {{ runDir: string, photosDir?: string | null, kitImagesDir?: string | null }} options
 */
export async function pictureFinders({
  runDir,
  photosDir = null,
  kitImagesDir = null,
  kitFile = null,
  webrootDir = null
}) {
  const { kit, frames: kitFrames } = await readKit(kitFile)
  const shots = await kitShots(kit, kitFile, kitImagesDir)
  const photoNames = photosDir ? await readdir(photosDir).catch(() => []) : []
  const demo = await blockImageFinder(kitImagesDir)
  const withSize = async (file) => (file ? { file, ...(await sizeOf(file)) } : null)
  return {
    /** A file the run wrote, by the path the manifest gives it (files/<sha256>.<ext>). */
    async output(relative) {
      if (typeof relative !== 'string' || !relative) return null
      const file = path.resolve(runDir, relative)
      if (!file.startsWith(`${path.resolve(runDir)}${path.sep}`)) return null
      return (await isFile(file)) ? withSize(file) : null
    },
    /** An owner original by the sha256 the brief records for the asset. */
    async original(sha256) {
      const name = photoNames.find(
        (n) => path.parse(n).name.toLowerCase() === String(sha256 ?? '').toLowerCase()
      )
      return sha256 && name ? withSize(path.join(photosDir, name)) : null
    },
    /** The template kit JSON, or null. */
    kit,
    /** A kit shot by image id ("page-home-1440"): { file, width, height }, or null. */
    shot: (imageId) => shots.get(imageId) ?? null,
    /** The kit frame (its display size), or null. */
    kitFrame: (frameId) => kitFrames.get(frameId) ?? null,
    /** The kit's demo picture of a frame: webroot + the frame's `picture`, else (fallback) an image named after the frame id. */
    async demo(frameId) {
      const picture = String(kitFrames.get(frameId)?.picture ?? '').split('#')[0]
      if (webrootDir && picture) {
        const root = path.resolve(webrootDir)
        const file = path.resolve(root, picture.replace(/^\/+/, ''))
        if (file.startsWith(`${root}${path.sep}`) && (await isFile(file))) return withSize(file)
      }
      return withSize(demo(frameId))
    }
  }
}
