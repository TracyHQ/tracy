// node perf/pairdiff.mjs <run>/shots <page--variant>... : share of pixels that differ (sum of channel deltas > 60) between each tile of a site shot and its source tile; "size" = the tile heights differ
import sharp from 'sharp'
import { readdirSync } from 'node:fs'
const [, , S, ...pages] = process.argv
for (const p of pages) {
  const a = `${S}/${p}`,
    b = `${S}/${p}--source`
  let out = []
  for (const f of readdirSync(a)
    .filter((n) => n.endsWith('.png'))
    .sort()) {
    try {
      const A = await sharp(`${a}/${f}`).raw().toBuffer({ resolveWithObject: true })
      const B = await sharp(`${b}/${f}`).raw().toBuffer({ resolveWithObject: true })
      if (A.info.width !== B.info.width || A.info.height !== B.info.height) {
        out.push(`${f}:size`)
        continue
      }
      let d = 0
      for (let i = 0; i < A.data.length; i += A.info.channels)
        if (
          Math.abs(A.data[i] - B.data[i]) +
            Math.abs(A.data[i + 1] - B.data[i + 1]) +
            Math.abs(A.data[i + 2] - B.data[i + 2]) >
          60
        )
          d++
      out.push(`${f}:${((100 * d) / (A.data.length / A.info.channels)).toFixed(1)}%`)
    } catch {
      out.push(`${f}:-`)
    }
  }
  console.log(p, out.join(' '))
}
