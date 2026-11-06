// The before and after crops of one repair, kept as files next to the run so a repair can be reviewed at any time, and
// shown to the checker. A crop is the repaired block: the box of the element that prints the slot's words (before: the
// words the site held, after: the words ordered), as the host measured it on the page (page-shots.js `boxes`), cut out of
// the tile that shows most of it, at every width the finder was shown. Where the host gave no box, or no box holds the
// words, at any width, the crop falls back to the whole tile where the finder saw the fault; `by` says which was used.
import sharp from 'sharp'
import { visibleText } from '../../lib/site-copy/emphasis-markup.js'
import { VIEWPORTS } from './fault-kinds.js'

/** The margin kept around a block box, in page pixels, so the checker sees what borders the block. */
const MARGIN = 24
/** How much of the words is looked for in an element's text (the host keeps a capped text per element). */
const LOOKED_FOR = 80

const bytesOf = (image) => Buffer.from(String(image).replace(/^data:image\/[a-z]+;base64,/, ''), 'base64')
const squash = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const clamp = (n, low, high) => Math.min(Math.max(n, low), high)

/**
 * The box of the element that prints these words on that page and width: the smallest whose text holds them, as stored
 * (markup printed raw) or as read (markup taken out). Null when no box holds them.
 */
export function blockBox(boxes, { page, viewport }, words) {
  const wanted = [...new Set([squash(words), squash(visibleText(words))])]
    .filter(Boolean)
    .map((w) => w.slice(0, LOOKED_FOR))
  if (!wanted.length) return null
  let smallest = null
  for (const box of boxes) {
    if (box.page !== page || box.viewport !== viewport) continue
    const text = squash(box.text)
    if (!wanted.some((w) => text.includes(w))) continue
    if (!smallest || box.width * box.height < smallest.width * smallest.height) smallest = box
  }
  return smallest
}

/** The box with its margin, cut out of the tile that shows most of it, or null when no tile shows it. */
async function cropOfBox(shots, box) {
  let tile = null
  let most = 0
  for (const shot of shots) {
    if (shot.page !== box.page || shot.viewport !== box.viewport) continue
    const shown = Math.min(box.y + box.height, shot.y + shot.height) - Math.max(box.y, shot.y)
    if (shown > most) {
      most = shown
      tile = shot
    }
  }
  if (!tile) return null
  const bytes = bytesOf(tile.image)
  const { width, height } = await sharp(bytes).metadata()
  const left = clamp(Math.floor(box.x - MARGIN), 0, width - 1)
  const top = clamp(Math.floor(box.y - tile.y - MARGIN), 0, height - 1)
  const right = clamp(Math.ceil(box.x + box.width + MARGIN), left + 1, width)
  const bottom = clamp(Math.ceil(box.y - tile.y + box.height + MARGIN), top + 1, height)
  const cut = await sharp(bytes)
    .extract({ left, top, width: right - left, height: bottom - top })
    .jpeg({ quality: 80 })
    .toBuffer()
  return {
    viewport: box.viewport,
    index: tile.index,
    image: `data:image/jpeg;base64,${cut.toString('base64')}`
  }
}

/** The crops of the block at every width where a box holds the words both before and after the repair. */
async function blockCrops({ fault, before, after, wordsBefore, wordsAfter }) {
  const pairs = []
  for (const viewport of VIEWPORTS) {
    const where = { page: fault.page, viewport }
    const boxBefore = blockBox(before.boxes ?? [], where, wordsBefore)
    const boxAfter = blockBox(after.boxes ?? [], where, wordsAfter)
    if (!boxBefore || !boxAfter) continue
    try {
      const pair = [await cropOfBox(before.shots, boxBefore), await cropOfBox(after.shots, boxAfter)]
      if (pair.every(Boolean)) pairs.push(pair)
    } catch {
      // A tile that cannot be cut is left to the fallback below; the log says which crop was used.
    }
  }
  return pairs
}

const tileOf = (shots, fault) =>
  shots.filter((s) => s.page === fault.page && s.viewport === fault.viewport && s.index === fault.tile)

/**
 * @param {{ fault: { page: string, viewport: string, tile: number }, before: { shots: object[], boxes?: object[] },
 *   after: { shots: object[], boxes?: object[] }, wordsBefore: string, wordsAfter: string, name: string,
 *   saveFile: (name: string, data: Buffer) => Promise<void> }} input
 * @returns {Promise<{ by: 'block' | 'tile', beforeShots: object[], afterShots: object[],
 *   files: { by: 'block' | 'tile', before: string[], after: string[] } }>}
 */
export async function cropsOf({ fault, before, after, wordsBefore, wordsAfter, name, saveFile }) {
  const pairs = await blockCrops({ fault, before, after, wordsBefore, wordsAfter })
  const by = pairs.length ? 'block' : 'tile'
  const beforeShots = pairs.length ? pairs.map(([b]) => b) : tileOf(before.shots, fault)
  const afterShots = pairs.length ? pairs.map(([, a]) => a) : tileOf(after.shots, fault)
  const files = { by, before: [], after: [] }
  for (const [when, list] of [
    ['before', beforeShots],
    ['after', afterShots]
  ])
    for (const shot of list) {
      const file = `crops/${name}-${when}-${by}-${shot.viewport}-${shot.index}.jpg`
      await saveFile(file, bytesOf(shot.image))
      files[when].push(file)
    }
  return { by, beforeShots, afterShots, files }
}
