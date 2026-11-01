// A cheap look at a body shot's layout: where its edges are (text, picture borders, buttons) on a coarse grid over
// the top of the 1440 shot, scaled down in a blank page's canvas. Edges, not colours: a dark template with a photo
// behind its title has no single background colour to measure ink against. Two shots of one layout have correlated
// grids even when their words and pictures differ, give or take a title that wraps to a second line (the grids are
// compared shifted up and down a little). Written to layout-profiles.json (image id -> profile) and read by assemble
// (layouts.mjs).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const GX = 12 // grid columns over the width
const GY = 56 // grid rows over the top TOP px (25 px a row at 1440)
const TOP = 1400
const SHIFT = 6 // rows a layout may slide down or up (a title on two lines)
/**
 * Two profiles at least this similar are one layout. Measured on JA Boxing 1.0.10: posts of one blog 0.69..0.81
 * (two with two-line titles over photos 0.53, 0.56: they get their own shot, the safe side), an offline, error or
 * typography page against a post at most 0.37, a class page against a post at most 0.52.
 */
export const SAME_LAYOUT = 0.6

function pearson(a, b) {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let xy = 0
  let xx = 0
  let yy = 0
  for (let i = 0; i < n; i++) {
    xy += (a[i] - ma) * (b[i] - mb)
    xx += (a[i] - ma) ** 2
    yy += (b[i] - mb) ** 2
  }
  if (!xx && !yy) return 1
  return xx && yy ? xy / Math.sqrt(xx * yy) : 0
}

/** Similarity of two profiles, -1..1: the best correlation of their edge grids, one slid up to SHIFT rows. */
export function profileSimilarity(a, b) {
  if (!a?.grid || !b?.grid || a.grid.length !== b.grid.length) return null
  const gx = a.gx ?? GX
  const gy = a.grid.length / gx
  let best = -1
  for (let s = -SHIFT; s <= SHIFT; s++) {
    const x = []
    const y = []
    for (let r = 0; r < gy; r++) {
      if (r + s < 0 || r + s >= gy) continue
      for (let c = 0; c < gx; c++) {
        x.push(a.grid[r * gx + c])
        y.push(b.grid[(r + s) * gx + c])
      }
    }
    best = Math.max(best, pearson(x, y))
  }
  return Math.round(best * 1000) / 1000
}

/**
 * @param {{chromium: object, out: string, kit: object}} o the body blocks' 1440 shots of `kit` are profiled
 * @returns {Promise<Record<string, {gx: number, grid: number[]}>>}
 */
export async function writeLayoutProfiles({ chromium, out, kit }) {
  const pathOf = new Map((kit.images ?? []).map((i) => [i.id, i.path]))
  const ids = kit.blocks
    .filter((b) => b.id.startsWith('body-'))
    .map((b) => b.images?.['1440'] ?? b.images?.[1440])
    .filter((id) => id && pathOf.has(id))
  const browser = await chromium.launch()
  const profiles = {}
  try {
    const page = await browser.newPage()
    for (const id of ids) {
      const data = readFileSync(join(out, pathOf.get(id))).toString('base64')
      profiles[id] = await page.evaluate(profileOf, { data, gx: GX, gy: GY, top: TOP })
    }
  } finally {
    await browser.close()
  }
  writeFileSync(join(out, 'layout-profiles.json'), `${JSON.stringify(profiles)}\n`)
  return profiles
}

// Runs in the browser: per grid cell, how many pixels of the scaled shot sit on an edge (a jump in lightness).
async function profileOf({ data, gx, gy, top }) {
  const img = new Image()
  img.src = `data:image/jpeg;base64,${data}`
  await img.decode()
  const w = 144
  const shown = Math.min(img.naturalHeight, top)
  const h = Math.max(3, Math.round(shown * (w / img.naturalWidth)))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0, img.naturalWidth, shown, 0, 0, w, h)
  const px = g.getImageData(0, 0, w, h).data
  const lum = (x, y) => {
    const i = (y * w + x) * 4
    return 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]
  }
  // The grid always spans TOP px, so a short shot leaves its lower rows empty rather than stretched.
  const span = top * (w / img.naturalWidth)
  const grid = Array.from({ length: gx * gy }, () => 0)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const e = Math.abs(lum(x + 1, y) - lum(x - 1, y)) + Math.abs(lum(x, y + 1) - lum(x, y - 1))
      if (e > 40)
        grid[
          Math.min(gy - 1, Math.floor((y / span) * gy)) * gx + Math.min(gx - 1, Math.floor((x / w) * gx))
        ]++
    }
  return { gx, grid }
}
