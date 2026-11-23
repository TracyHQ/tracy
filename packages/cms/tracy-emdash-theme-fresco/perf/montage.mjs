import sharp from 'sharp'
const [, , out, ...files] = process.argv
const imgs = await Promise.all(
  files.map(async (f) => {
    const b = await sharp(f).resize(380).toBuffer()
    const m = await sharp(b).metadata()
    return { b, h: m.height }
  })
)
const H = Math.max(...imgs.map((i) => i.h))
await sharp({ create: { width: 390 * imgs.length, height: H, channels: 3, background: '#888' } })
  .composite(imgs.map((i, k) => ({ input: i.b, left: k * 390, top: 0 })))
  .jpeg({ quality: 70 })
  .toFile(out)
