// The three pixel modes of recolour_mark (ported from the approved lab's recolour-mark): palette, solid, invert.
// Each edits `data` (RGBA, w x h) in place and returns the part of the tool result that is its own.
import { contrastHex, hex, parseHexColour } from './common.js'

const lin = (v0) => {
  const v = v0 / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const gam = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
function toLab(r0, g0, b0) {
  const r = lin(r0)
  const g = lin(g0)
  const b = lin(b0)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.7936285972 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}
function fromLab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const cl = (v) => Math.max(0, Math.min(255, Math.round(gam(Math.max(0, v)))))
  return [
    cl(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    cl(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    cl(-0.0041960863 * l - 0.7034134229 * m + 1.707614701 * s)
  ]
}
const median = (v) => v.slice().sort((x, y) => x - y)[v.length >> 1]
const setRgb = (data, i, r, g, b) => {
  data[i * 4] = r
  data[i * 4 + 1] = g
  data[i * 4 + 2] = b
}

/** Every colour under 3:1 on the ground takes the heading colour; the others stay. */
export function paletteMode({ data, n, palette, ground, colour }) {
  const map = {}
  for (const k of palette.keys()) map[k] = contrastHex(k, ground) >= 3 ? k : colour
  let figure = 0
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] === 0) continue
    const t = parseHexColour(map[hex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])])
    setRgb(data, i, t.r, t.g, t.b)
    if (data[i * 4 + 3] > 10) figure++
  }
  return {
    figure,
    result: {
      ok: true,
      palette: [...palette.keys()].map((k) => ({
        from: k,
        onGround: contrastHex(k, ground),
        to: map[k],
        toOnGround: contrastHex(map[k], ground)
      })),
      ground,
      fill: null
    }
  }
}

/** The figure to one colour, alpha kept; a kept fill (mask) is left as is. */
export function solidMode({ data, n, mask, maskFile, colour }) {
  const c = parseHexColour(colour)
  const fr = []
  const fg = []
  const fb = []
  let fill = 0
  let figure = 0
  for (let i = 0; i < n; i++) {
    if (mask && mask[i] >= 128) {
      fill++
      fr.push(data[i * 4])
      fg.push(data[i * 4 + 1])
      fb.push(data[i * 4 + 2])
      continue
    }
    setRgb(data, i, c.r, c.g, c.b)
    if (data[i * 4 + 3] > 10) figure++
  }
  const fillColour = fill ? hex(median(fr), median(fg), median(fb)) : null
  const ratio = fillColour ? contrastHex(colour, fillColour) : null
  const clash = fillColour && ratio < 3
  return {
    figure,
    result: {
      ok: !clash,
      ...(clash
        ? {
            error: `the new figure colour ${colour} reads ${ratio}:1 on the kept fill ${fillColour}: the figure vanishes into the fill. Use mode invert`
          }
        : {}),
      fill: mask ? { mask: maskFile, keptPixels: fill, colour: fillColour, figureOnFill: ratio } : null
    }
  }
}

/** A negative by OKLab lightness: kept fill -> side ground, figure tones run to the heading colour, 3:1 floor. */
export function invertMode({ data, n, mask, maskFile, ground, colour }) {
  const EDGE_T = 0.15
  const c = parseHexColour(colour)
  const G = toLab(...Object.values(parseHexColour(ground)))
  const H = toLab(c.r, c.g, c.b)
  const mix = (u) => fromLab([0, 1, 2].map((k) => G[k] + u * (H[k] - G[k])))
  let u3 = 1 // the smallest mix from the ground that reads 3:1 on the ground
  for (let k = 0; k <= 1000; k++)
    if (contrastHex(hex(...mix(k / 1000)), ground) >= 3) {
      u3 = k / 1000
      break
    }
  const Ls = new Float32Array(n)
  const fillL = []
  const figL = []
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] === 0) continue
    Ls[i] = toLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])[0]
    if (mask[i] >= 128) fillL.push(Ls[i])
    else if (data[i * 4 + 3] > 200) figL.push(Ls[i])
  }
  if (!fillL.length) return { error: 'the mask has no kept fill: nothing to invert, use mode solid' }
  const Lfill = median(fillL)
  const dists = figL.map((L) => Math.abs(L - Lfill)).sort((x, y) => x - y)
  const span = dists[Math.floor(dists.length * 0.99)] || 1
  const sign = figL.length && median(figL) < Lfill ? 1 : -1 // figure darker than the fill, or lighter
  const tones = new Map()
  let figure = 0
  let fill = 0
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] === 0) continue
    const t = Math.max(0, Math.min(1, (sign * (Lfill - Ls[i])) / span))
    const u = t <= EDGE_T ? (u3 * t) / EDGE_T : u3 + ((t - EDGE_T) / (1 - EDGE_T)) * (1 - u3)
    const [r, g, b] = mix(u)
    setRgb(data, i, r, g, b)
    if (mask[i] >= 128) fill++
    else if (data[i * 4 + 3] > 200) {
      figure++
      const k = hex(r & 0xf0, g & 0xf0, b & 0xf0)
      tones.set(k, (tones.get(k) ?? 0) + 1)
    }
  }
  const main = [...tones.entries()]
    .sort((p, q) => q[1] - p[1])
    .slice(0, 3)
    .map(([k, cnt]) => ({ tone: k, share: +(cnt / figure).toFixed(3), onGround: contrastHex(k, ground) }))
  const fillColour = hex(...mix(0))
  const floor = hex(...mix(u3))
  return {
    figure,
    result: {
      ok: true,
      invert: {
        ground,
        heading: colour,
        fillBecomes: fillColour,
        figureFloor: floor,
        figureFloorOnGround: contrastHex(floor, ground),
        headingOnFill: contrastHex(colour, fillColour),
        originalFillLightness: +Lfill.toFixed(3),
        mainFigureTones: main
      },
      fill: { mask: maskFile, keptPixels: fill }
    }
  }
}
