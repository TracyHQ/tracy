// The cropped screenshot of each finding group (ticket #585, the owner's review page): the group's first box on a
// full page shot of a render, with a margin, cut out of that shot into `crops/<group id>.png`. The image library is
// injected (`sharp`), so nothing here loads one. A group with no box (hidden words, a request, a meta value) has none.
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const MARGIN = 32
const MAX_HEIGHT = 520

/**
 * @param {{groups: object[], out: string, sharp: Function}} input
 * @returns {Promise<number>} how many crops were written
 */
export async function cropGroups({ groups, out, sharp }) {
  mkdirSync(path.join(out, 'crops'), { recursive: true })
  const sizes = new Map()
  let n = 0
  for (const g of groups) {
    const c = g.crop
    if (!c?.shot || !c.box) continue
    const file = path.join(out, c.shot)
    try {
      if (!sizes.has(file)) sizes.set(file, await sharp(file).metadata())
      const { width, height } = sizes.get(file)
      const left = Math.max(0, c.box.x - MARGIN)
      const top = Math.max(0, c.box.y - MARGIN)
      const w = Math.min(width - left, c.box.w + 2 * MARGIN)
      const h = Math.min(height - top, Math.min(MAX_HEIGHT, c.box.h + 2 * MARGIN))
      if (w < 8 || h < 8) continue
      const name = `crops/${g.id}.png`
      await sharp(file)
        .extract({ left, top, width: w, height: h })
        .resize({ width: Math.min(w, 720), withoutEnlargement: true })
        .png()
        .toFile(path.join(out, name))
      g.cropFile = name
      n += 1
    } catch {
      // A shot that cannot be read leaves the group without a crop; the page says so.
    }
  }
  return n
}
