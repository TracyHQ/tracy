// The kit's block images in a folder: the 1440 image of each block id, and one image as a data URI. Shared by the copy
// and picture reading pages.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}
const MAX_DEPTH = 2

async function listImages(dir, depth = 0) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && depth < MAX_DEPTH) out.push(...(await listImages(full, depth + 1)))
    else if (entry.isFile() && IMAGE_TYPES[path.extname(entry.name).toLowerCase()]) out.push(full)
  }
  return out
}

/**
 * Finds the 1440 image of each block id in a folder of kit images. A file belongs to a block when its name holds the
 * block id as a whole token ("block-2" matches "block-2-1440.png" but not "block-20-1440.png"); the 1440 one wins
 * over any other width, and a name that only says another width (390) is not used.
 * @param {string | null} dir
 * @returns {Promise<(blockId: string) => string | null>} the path of the image, or null
 */
export async function blockImageFinder(dir) {
  const files = dir ? await listImages(dir) : []
  return (blockId) => {
    const token = new RegExp(
      `(^|[^a-z0-9])${blockId.toLowerCase().replace(/[^a-z0-9]/g, '\\$&')}([^0-9a-z]|$)`
    )
    const hits = files.filter((f) => token.test(path.basename(f).toLowerCase()))
    const width = (f) =>
      path.basename(f).includes('1440') ? 0 : /390|768|1024/.test(path.basename(f)) ? 2 : 1
    return hits.sort((a, b) => width(a) - width(b) || a.localeCompare(b)).find((f) => width(f) < 2) ?? null
  }
}

/** One image file as a data URI. */
export async function imageDataUri(file) {
  const bytes = await readFile(file)
  return `data:${IMAGE_TYPES[path.extname(file).toLowerCase()]};base64,${bytes.toString('base64')}`
}
