// The marker pictures of the marker build (ticket #585): every stored picture the write uploads is a small PNG of its
// own, a flat colour drawn from its code with the code in a text chunk, so the file a page shows can be traced back to
// the one picture place that wrote it by its bytes (the write names an upload by its bytes' hash), and a picture a page
// shows that is no marker picture is a leak. A picture written to a slot whose blank site contract declares its shape
// (`fit`) is drawn at that shape, since the plugin refuses any other width over height there (`pictureShapesOf`). Pure.
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

/** The size of a marker picture, in pixels. */
export const MARKER_PICTURE_SIZE = 64

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/**
 * A PNG of one flat colour with a text chunk naming its code, `width` by `height` pixels. `transparent`: an RGBA file
 * whose one pixel frame is clear, so its corners read transparent (the plugin reads a corner's alpha).
 */
export function markerPng(code, width = MARKER_PICTURE_SIZE, height = width, { transparent = false } = {}) {
  const hash = createHash('sha256').update(code).digest()
  const [r, g, b] = hash
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, transparent ? 6 : 2, 0, 0, 0], 8)
  const pixel = (x, y) =>
    !transparent ? [r, g, b] : [r, g, b, x && y && x < width - 1 && y < height - 1 ? 255 : 0]
  const row = (y) => Buffer.from([0, ...Array.from({ length: width }, (_, x) => pixel(x, y)).flat()])
  const [edge, inner] = [row(0), row(1)]
  const raw = Buffer.concat(Array.from({ length: height }, (_, y) => (y && y < height - 1 ? inner : edge)))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`Comment\0marker ${code}`, 'latin1')),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * The bytes of the stored picture `id`: its code is taken from the registry once per stored id, so the same picture
 * opened twice gives the same bytes. `shape`: the width and height of the slot it is written to, if it has one.
 */
export function markerPictureBytes(registry, id, shape = null) {
  const had = registry.entries.find((e) => e.what === 'picture' && e.stored === id)
  const code = had?.code ?? registry.take({ what: 'picture', stored: id })
  return shape ? markerPng(code, shape.width, shape.height, shape) : markerPng(code)
}

/** The sha256 of bytes, hex. */
export const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** The width and height a PNG's header declares. */
export const pngSize = (bytes) => {
  const b = Buffer.from(bytes)
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/**
 * The size a slot's declared shape asks (the source's own size when the contract measured one, else its minimum width),
 * and whether it needs a transparent ground.
 */
function sizeOf(fit) {
  const transparent = fit.transparent === true
  if (fit.source?.width && fit.source?.height)
    return { width: fit.source.width, height: fit.source.height, transparent }
  const width = Math.max(fit.minWidth ?? 0, MARKER_PICTURE_SIZE)
  return { width, height: Math.max(1, Math.round(width / fit.aspect)), transparent }
}

/**
 * The shape of every stored picture the write plan puts in a slot whose contract declares one (`fit` with `aspect`),
 * by stored id. A picture written to two slots of different shapes keeps the first, and the pair is in `conflicts`:
 * the plugin then refuses the second, and the write stops there.
 * @param {{ops: object[]} | null} plan the marker build's write plan
 * @param {{slots?: object[]} | null} contract the blank site contract's content map
 * @returns {{shapes: Record<string, {width: number, height: number}>, conflicts: {picture: string, slots: string[]}[]}}
 */
/** The width over height a slot asks for: its source picture's when it names one, else its aspect. */
const aspectOf = (fit) =>
  fit.source?.width && fit.source?.height ? fit.source.width / fit.source.height : Number(fit.aspect)
/** Two aspects closer than this (0.5%) are one shape: what rounding a height to whole pixels moves. */
const ASPECT_TOLERANCE = 0.005

export function pictureShapesOf(plan, contract) {
  const fits = new Map((contract?.slots ?? []).filter((s) => s.fit?.aspect).map((s) => [s.key, s.fit]))
  const storedOf = new Map(
    (plan?.ops ?? [])
      .filter((o) => o.kind === 'picture.upload' && o.stored?.id)
      .map((o) => [o.key, o.stored.id])
  )
  const shapes = {}
  const from = {}
  const conflicts = []
  const aspects = {}
  for (const op of plan?.ops ?? [])
    for (const v of op.values ?? []) {
      const ref = String(v.value?.ref ?? '')
      const fit = fits.get(v.loc?.slot)
      const id = storedOf.get(ref)
      if (!ref.startsWith('picture:') || !fit || !id) continue
      const size = sizeOf(fit)
      if (!shapes[id]) [shapes[id], from[id], aspects[id]] = [size, v.loc.slot, aspectOf(fit)]
      // Compared on the slots' aspects, never on rounded heights: one aspect at two minimum widths is one shape.
      else if (Math.abs(aspects[id] / aspectOf(fit) - 1) > ASPECT_TOLERANCE)
        conflicts.push({ picture: ref.slice('picture:'.length), slots: [from[id], v.loc.slot] })
    }
  return { shapes, conflicts }
}
