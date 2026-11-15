// The marker pictures of the marker build (ticket #585): every stored picture the write uploads is a small PNG of its
// own, a flat colour drawn from its code with the code in a text chunk, so the file a page shows can be traced back to
// the one picture place that wrote it by its bytes (the write names an upload by its bytes' hash), and a picture a page
// shows that is no marker picture is a leak. Pure.
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

/** A PNG of one flat colour with a text chunk naming its code. */
export function markerPng(code, size = MARKER_PICTURE_SIZE) {
  const hash = createHash('sha256').update(code).digest()
  const [r, g, b] = hash
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())
  ])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
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
 * opened twice gives the same bytes.
 */
export function markerPictureBytes(registry, id) {
  const had = registry.entries.find((e) => e.what === 'picture' && e.stored === id)
  const code = had?.code ?? registry.take({ what: 'picture', stored: id })
  return markerPng(code)
}

/** The sha256 of bytes, hex. */
export const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex')
