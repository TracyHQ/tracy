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
export async function pictureFinders({ runDir, photosDir = null, kitImagesDir = null }) {
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
    /** The kit's demo picture of a frame: an image whose name holds the frame id. */
    demo: async (frameId) => withSize(demo(frameId))
  }
}
