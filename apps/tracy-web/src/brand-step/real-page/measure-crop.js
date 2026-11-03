// Script measures on a captured picture (#322): letter height and contrast of a logo, from the pixels. The logo's box
// comes from the page (where the image sits); the pixels decide what is ink and what is ground. No model.
import sharp from 'sharp'
import { contrastHex, hex } from '../colour-math.js'

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * @param {Buffer} png the captured picture
 * @param {{ x: number, y: number, width: number, height: number }} rect the logo's box in that picture, CSS px
 * @returns {Promise<{ letterPx: number | null, lines: number, contrast: number | null, ink: string | null, ground: string | null }>}
 */
export async function measureLogo(png, rect) {
  const meta = await sharp(png).metadata()
  const left = Math.max(0, Math.min(meta.width - 1, Math.round(rect.x)))
  const top = Math.max(0, Math.min(meta.height - 1, Math.round(rect.y)))
  const width = Math.max(1, Math.min(meta.width - left, Math.round(rect.width)))
  const height = Math.max(1, Math.min(meta.height - top, Math.round(rect.height)))
  const { data, info } = await sharp(png)
    .extract({ left, top, width, height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]
  // Ground: the median of the border pixels.
  const border = []
  for (let x = 0; x < info.width; x++) border.push(px(x), px((info.height - 1) * info.width + x))
  for (let y = 0; y < info.height; y++) border.push(px(y * info.width), px(y * info.width + info.width - 1))
  const med = (c) => border.map((p) => p[c]).sort((a, b) => a - b)[Math.floor(border.length / 2)]
  const ground = [med(0), med(1), med(2)]
  const away = new Float32Array(info.width * info.height)
  let max = 0
  for (let i = 0; i < away.length; i++) {
    away[i] = dist(px(i), ground)
    if (away[i] > max) max = away[i]
  }
  // Nothing stands out from the ground at all: the logo is invisible, which is a contrast of 1.
  if (max < 10) return { letterPx: null, lines: 0, contrast: 1, ink: hex(...ground), ground: hex(...ground) }
  const seen = Math.max(10, max * 0.5)
  // Ink: clearly away from the ground. Its core colour is the mean of the pixels near the maximum distance.
  const rows = []
  const core = [0, 0, 0]
  let n = 0
  for (let y = 0; y < info.height; y++) {
    let any = 0
    for (let x = 0; x < info.width; x++) {
      const d = away[y * info.width + x]
      if (d > seen) any++
      if (d > max * 0.8) {
        const p = px(y * info.width + x)
        core[0] += p[0]
        core[1] += p[1]
        core[2] += p[2]
        n++
      }
    }
    rows.push(any > 0)
  }
  const bands = []
  let run = 0
  for (const on of [...rows, false]) {
    if (on) run++
    else {
      if (run >= 4) bands.push(run)
      run = 0
    }
  }
  const inkHex = hex(core[0] / n, core[1] / n, core[2] / n)
  const groundHex = hex(...ground)
  return {
    letterPx: bands.length ? Math.min(...bands) : null,
    lines: bands.length,
    contrast: contrastHex(inkHex, groundHex),
    ink: inkHex,
    ground: groundHex
  }
}
