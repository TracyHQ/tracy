import sharp from 'sharp'
const [, , src, outPrefix, h = '2400', scale = '0.5'] = process.argv
const m = await sharp(src).metadata()
const H = +h
let n = 0
for (let y = 0; y < m.height; y += H, n++) {
  const hh = Math.min(H, m.height - y)
  await sharp(src)
    .extract({ left: 0, top: y, width: m.width, height: hh })
    .resize(Math.round(m.width * +scale))
    .jpeg({ quality: 70 })
    .toFile(`${outPrefix}-${n}.jpg`)
}
console.log(m.width, m.height, n)
