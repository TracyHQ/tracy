// The picture rule of an image slot of the memory site (ticket #597, gate run 7): a slot whose content map declares its
// shape (`fit` with an `aspect`) takes only a picture of that shape, and one that asks for a transparent ground
// (`fit.transparent`) only a picture whose corners are clear. The plugin refuses anything else (`SLOT_IMAGE_INVALID`,
// `SLOT_IMAGE_OPAQUE`, the gate's measured refusals, docs/references/ai-quickstart-contract.md "Markers"): a square
// logo in the footer logo slot (393 x 113, transparent) stopped the whole write on a real site. The shape is the
// slot's source picture when it names one, else its aspect, within `fit.tolerance` (0.02 when none), at least
// `fit.minWidth` wide. Pure: the size and the corners are read from the bytes (PNG and JPEG headers, a PNG's pixels
// inflated with `node:zlib`). Bytes it cannot read (the invented bytes of most tests), or a path with no upload, are
// taken: memory only.
import { inflateSync } from 'node:zlib'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

/** The PNG's size, colour type and the alpha of its four corners (null when it has no alpha channel). */
function pngOf(b) {
  if (b.length < 33 || !PNG.every((x, i) => b[i] === x)) return null
  const width = b.readUInt32BE(16)
  const height = b.readUInt32BE(20)
  const [depth, type, , , interlace] = b.subarray(24, 29)
  const out = { format: 'png', width, height, corners: null }
  if (!CHANNELS[type] || depth !== 8 || interlace !== 0 || (type !== 4 && type !== 6)) return out
  const chunks = []
  for (let at = 8; at + 8 <= b.length; ) {
    const length = b.readUInt32BE(at)
    const kind = b.toString('latin1', at + 4, at + 8)
    if (kind === 'IDAT') chunks.push(b.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const bpp = CHANNELS[type]
  const stride = width * bpp
  const rows = []
  let previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0
      const up = previous[x]
      const c = x >= bpp ? previous[x - bpp] : 0
      const p = a + up - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - up)
      const pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? up : c
      const add = [0, a, up, (a + up) >> 1, paeth][filter] ?? 0
      line[x] = (line[x] + add) & 0xff
    }
    if (y === 0 || y === height - 1) rows[y === 0 ? 0 : 1] = line
    if (height === 1) rows[1] = line
    previous = line
  }
  const alphaAt = (line, x) => line[x * bpp + bpp - 1]
  out.corners = [rows[0], rows[1]].flatMap((line) => [alphaAt(line, 0), alphaAt(line, width - 1)])
  return out
}

/** A JPEG's size from its first frame header; a JPEG has no alpha. */
function jpegOf(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  for (let at = 2; at + 9 < b.length; ) {
    if (b[at] !== 0xff) return null
    const marker = b[at + 1]
    const length = b.readUInt16BE(at + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { format: 'jpeg', height: b.readUInt16BE(at + 5), width: b.readUInt16BE(at + 7), corners: [] }
    at += 2 + length
  }
  return null
}

/** What the memory site reads of a picture: `{format, width, height, corners}`, or null for bytes it cannot read. */
export function pictureShapeOf(bytes) {
  const b = Buffer.from(bytes ?? [])
  try {
    return pngOf(b) ?? jpegOf(b)
  } catch {
    return null
  }
}

/** The width over height a slot asks for: its source picture's when it names one, else its aspect. */
export const slotAspectOf = (fit) =>
  fit?.source?.width && fit?.source?.height ? fit.source.width / fit.source.height : Number(fit?.aspect)

/**
 * The refusal of a picture at an image slot, or null. `uploads`: the site's files by path.
 * @returns {{code: string, message: string} | null}
 */
export function imageSlotRefusal(slot, value, uploads) {
  const fit = slot?.fit
  if (slot?.type !== 'image' || !fit?.aspect || String(value ?? '') === '') return null
  const bytes = uploads?.get(String(value))
  // A path the memory site holds no upload for (a template picture, a door test's own path) is taken: memory only.
  const shape = bytes ? pictureShapeOf(bytes) : null
  if (!shape) return null
  const tolerance = Number(fit.tolerance ?? 0.02)
  const off = Math.abs(shape.width / shape.height / slotAspectOf(fit) - 1)
  if (off > tolerance || shape.width < Number(fit.minWidth ?? 0))
    return {
      code: 'SLOT_IMAGE_INVALID',
      message: `${slot.key}: ${shape.width}x${shape.height} is not the slot shape`
    }
  if (fit.transparent === true && (!shape.corners || shape.corners.some((a) => a !== 0)))
    return { code: 'SLOT_IMAGE_OPAQUE', message: `${slot.key}: the slot needs a transparent ground` }
  return null
}
