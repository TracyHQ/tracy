/**
 * What a picture's bytes say about it, and one cut — nothing else, so the agent's `media.draw` and
 * the seed's hero can share it without the seeder's planning code coming along.
 */
import jpeg from 'jpeg-js'

/**
 * The width and height a PNG, JPEG or WebP file says it has — read from its header, nothing decoded.
 * @param {Buffer} b @returns {[number, number] | null}
 */
export function imageSize(b) {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
    if (kind === 'VP8L') {
      const v = b.readUInt32LE(21)
      return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]
    }
    return null
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let at = 2
    while (at + 9 < b.length) {
      if (b[at] !== 0xff) return null
      const marker = b[at + 1]
      const length = b.readUInt16BE(at + 2)
      // SOF0..SOF15 carry the frame size; 0xC4, 0xC8 and 0xCC are not frames.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return [b.readUInt16BE(at + 7), b.readUInt16BE(at + 5)]
      at += 2 + length
    }
  }
  return null
}

/**
 * A JPEG cut from its centre to `aspect` (width / height). The Claude Cowork plugin refuses a picture whose shape
 * differs from the demo's by more than 0.02 — measured 23/09/2026 on `j-ee6vsk`: the model drew
 * 1376×768 (16:9) for a 1600×1000 (16:10) hero, and that one value failed the whole seed. Picture
 * models offer a fixed list of shapes that does not include 16:10, so the cut is made here.
 * @param {Buffer} bytes @param {number} aspect @returns {Buffer}
 */
export function cutToAspect(bytes, aspect) {
  const image = jpeg.decode(bytes, { useTArray: true })
  const { width, height } = image
  let w = width
  let h = Math.round(width / aspect)
  if (h > height) {
    h = height
    w = Math.round(height * aspect)
  }
  const x0 = Math.floor((width - w) / 2)
  const y0 = Math.floor((height - h) / 2)
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * width + x0) * 4
    out.set(image.data.subarray(from, from + w * 4), y * w * 4)
  }
  return Buffer.from(jpeg.encode({ width: w, height: h, data: out }, 86).data)
}
