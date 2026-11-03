// A favicon.ico made of PNG images (every browser since 2010 reads PNG-embedded ICO entries). The lab used the
// png-to-ico package; this is the same file layout without the dependency.
export function pngsToIco(pngs) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(1, 2) // type: icon
  head.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const entries = pngs.map((png) => {
    const e = Buffer.alloc(16)
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)
    e[0] = w >= 256 ? 0 : w
    e[1] = h >= 256 ? 0 : h
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([head, ...entries, ...pngs])
}
