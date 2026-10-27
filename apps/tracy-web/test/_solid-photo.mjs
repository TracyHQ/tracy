/** A test photograph for the preview detectors: a valid PNG Chrome draws, so a shot of the page reads it. */
import { crc32, deflateSync } from 'node:zlib'

/** A solid 8×8 PNG photograph of one colour, as a data URL. */
export const solidPhoto = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => {
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: 8 }, () => [r, g, b]).flat())
  ])
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.from([0, 0, 0, 8, 0, 0, 0, 8, 8, 2, 0, 0, 0])
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 8 }, () => row)))),
    chunk('IEND', Buffer.alloc(0))
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}
