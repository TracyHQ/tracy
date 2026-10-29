/**
 * A picture the engine writes is at least as wide as its slot's Slot fit asks (`fit.minWidth`).
 *
 * The Claude Cowork plugin refuses a picture narrower than `fit.minWidth` (`SlotFit.php`, `SLOT_IMAGE_TOO_SMALL`), and a
 * refused picture leaves the demo's in its place. The limit is 1.5 times the slot's desktop box, which is wider than many
 * of a business's own photos (a social post is 360 to 1080 pixels) and wider than the template's own demo file. Measured
 * on the local stand (29/10/2026, a brief build on a Joomla T4 template): every owner photo, colour block and cut-out
 * of the gallery, hero and feature slots was refused for this, so the site kept every demo picture.
 *
 * So the last step before the upload enlarges a picture to the widest `minWidth` of the slots it serves, keeping its
 * shape and its transparency. The browser enlarges a small file to the same box anyway; doing it here only lets the file
 * pass the plugin's check. A picture that is already wide enough is untouched, byte for byte.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const MAX_PIXELS = 100_000_000
const JPEG = { quality: 84, mozjpeg: false }
const PNG = { compressionLevel: 9 }

/**
 * The widest `fit.minWidth` of the slots a group serves, or 0.
 * @param {{slots: Array<{key: string}>}} group
 * @param {Map<string, any>} slotByKey
 */
export function minWidthOf(group, slotByKey) {
  let most = 0
  for (const binding of group?.slots ?? []) {
    const min = slotByKey.get(binding.key)?.fit?.minWidth
    if (Number.isInteger(min) && min > most) most = min
  }
  return most
}

/**
 * Enlarge each shaped picture to the `minWidth` its slots ask, keeping its aspect and format.
 * @template {{group: {slots: Array<{key: string}>}, bytes: Buffer, ext: string, hash: string, receipt?: any}} T
 * @param {T[]} shaped
 * @param {{slots?: any[]}} contentMap
 * @returns {Promise<T[]>}
 */
export async function meetSlotMinWidth(shaped, contentMap) {
  const slotByKey = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  const out = []
  for (const item of shaped) {
    const min = minWidthOf(item.group, slotByKey)
    if (!min) {
      out.push(item)
      continue
    }
    try {
      const meta = await sharp(item.bytes, { limitInputPixels: MAX_PIXELS, failOn: 'none' }).metadata()
      if (!meta.width || !meta.height || meta.width >= min) {
        out.push(item)
        continue
      }
      const height = Math.round((meta.height * min) / meta.width)
      const sized = sharp(item.bytes, { limitInputPixels: MAX_PIXELS, failOn: 'none' }).resize(min, height, {
        fit: 'fill',
        kernel: 'lanczos3'
      })
      const bytes = await (item.ext === 'png' ? sized.png(PNG) : sized.jpeg(JPEG)).toBuffer()
      const hash = createHash('sha256').update(bytes).digest('hex')
      out.push({
        ...item,
        bytes,
        hash,
        ...(item.receipt
          ? { receipt: { ...item.receipt, width: min, height, enlargedFrom: meta.width } }
          : {})
      })
    } catch {
      // An unreadable picture goes as it is: the site says why it refuses it, as before.
      out.push(item)
    }
  }
  return out
}
