// Favicon code check (decision 19): a 32 px tab icon is measured by code, no model. It must (1) fill enough of its
// square and (2) stand out from a light tab (#ffffff) and a dark tab (#202124), measured on the 32 x 32 pixels as
// a browser shows them:
//   shape        = pixels with alpha >= 128 (transparent icon), or, for a tile icon, the mark's pixels on the tile:
//                  pixels that differ from the tile ground by more than 1.15:1 contrast (the tile itself is ground).
//   bboxShare    = bounding box of the shape / the 32 x 32 square. Fails under MIN_BBOX (0.2).
//   inkShare     = shape pixels / 1024 (reported, no threshold).
//   per tab: contrastShare = share of shape pixels whose colour, as shown on that tab (composited on the tab for a
//                  transparent icon; on the tile for a tile icon), reads at least 3:1 against what is around it
//                  (the tab colour; the tile ground for a tile icon). Fails under MIN_CONTRAST_SHARE (0.5).
// pass = bboxShare >= 0.2 and contrastShare >= 0.5 on both tabs.
import sharp from 'sharp'
import { contrastHex, hex } from '../lib/brand-accent/colour-math.js'

export const TABS = ['#ffffff', '#202124']
export const MIN_BBOX = 0.2
export const MIN_CONTRAST_SHARE = 0.5
export const MIN_RATIO = 3
const rgb = (h) => ({
  r: Number.parseInt(h.slice(1, 3), 16),
  g: Number.parseInt(h.slice(3, 5), 16),
  b: Number.parseInt(h.slice(5, 7), 16)
})
const r3 = (x) => Math.round(x * 1000) / 1000

/** Measure a 32 px tab icon given as image bytes. tileGround: the tile colour when the icon is a tile (else null). */
export async function checkFavicon(bytes, { tileGround = null } = {}) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const tg = tileGround ? rgb(tileGround.toLowerCase()) : null
  const shape = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const al = data[i + 3]
      const p = { r: data[i], g: data[i + 1], b: data[i + 2], a: al / 255 }
      if (tg) {
        // tile: the mark's pixels are those that differ from the tile ground (opaque part of the tile)
        if (al < 128) continue
        const shown = {
          r: p.r * p.a + tg.r * (1 - p.a),
          g: p.g * p.a + tg.g * (1 - p.a),
          b: p.b * p.a + tg.b * (1 - p.a)
        }
        if (contrastHex(hex(shown.r, shown.g, shown.b), tileGround) <= 1.15) continue
        shape.push({ x, y, p })
      } else if (al >= 128) shape.push({ x, y, p })
    }
  }
  const n = shape.length
  let bboxShare = 0
  if (n) {
    const xs = shape.map((s) => s.x)
    const ys = shape.map((s) => s.y)
    bboxShare = ((Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1)) / (W * H)
  }
  const tabs = {}
  for (const tab of TABS) {
    const around = tg ? tileGround : tab
    const ar = rgb(around)
    let ok = 0
    for (const { p } of shape) {
      const c = {
        r: p.r * p.a + ar.r * (1 - p.a),
        g: p.g * p.a + ar.g * (1 - p.a),
        b: p.b * p.a + ar.b * (1 - p.a)
      }
      if (contrastHex(hex(c.r, c.g, c.b), around) >= MIN_RATIO) ok++
    }
    const contrastShare = n ? ok / n : 0
    tabs[tab] = {
      against: tg ? `tile ${tileGround}` : `tab ${tab}`,
      contrastShare: r3(contrastShare),
      pass: contrastShare >= MIN_CONTRAST_SHARE,
      ...(tg
        ? { tileEdge: { ratio: Math.round(contrastHex(tileGround, tab) * 100) / 100, advisory: true } }
        : {})
    }
  }
  const bboxPass = bboxShare >= MIN_BBOX
  return {
    size: `${W}x${H}`,
    kind: tg ? 'tile' : 'transparent',
    tileGround: tileGround ?? null,
    bboxShare: r3(bboxShare),
    bboxPass,
    inkShare: r3(n / (W * H)),
    tabs,
    rule: `bboxShare >= ${MIN_BBOX}; on each tab at least ${MIN_CONTRAST_SHARE * 100}% of the shape's pixels at ${MIN_RATIO}:1 or more against what is around them`,
    pass: bboxPass && TABS.every((t) => tabs[t].pass)
  }
}
