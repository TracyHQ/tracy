// Colour maths of the brand step gate: hex parsing, WCAG contrast, OKLCH neutral test and the accent lift
// (decision 9: a dark or pale colour with a clear hue is a real brand colour; its HSL lightness moves, hue and
// saturation kept, until it reads on the template's opening ground). Pure functions, no files, no environment.

/** OKLCH chroma under this = black, grey or white (no hue a visitor can see). #042515 is 0.050, #1a1a1a 0. */
export const NEUTRAL_CHROMA = 0.03
/** Hard rule for text and buttons (WCAG 2.1 contrast, decision 2). */
export const MIN_RATIO = 3
/** The design system code's own aim for accent words. */
export const WORD_RATIO = 4.5
/** Icon colour against plate colour for the plate fallback (WCAG 2.1 non-text contrast, 3:1). */
export const PLATE_MIN_RATIO = 3

export const hex = (r, g, b) =>
  `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`

export function parseHexColour(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h ?? ''))
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }
}

const linear = (c) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = ({ r, g, b }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)

/** WCAG contrast ratio of two #rrggbb colours, rounded to two decimals. */
export function contrastHex(a, b) {
  const A = luminance(parseHexColour(a))
  const B = luminance(parseHexColour(b))
  return +((Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05)).toFixed(2)
}

const srgbToLinear = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** OKLab lightness (0..1) and chroma of a #rrggbb colour. */
export function oklch(h) {
  const c = parseHexColour(h)
  const r = srgbToLinear(c.r)
  const g = srgbToLinear(c.g)
  const b = srgbToLinear(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.7936285972 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L: +L.toFixed(3), C: +Math.hypot(A, B).toFixed(4) }
}

/** Black, grey or white by chroma (lightness does not matter): the reason, or null for a real colour. */
export function neutralReason(h) {
  if (!parseHexColour(h)) return 'not #rrggbb'
  const { L, C } = oklch(h)
  if (C >= NEUTRAL_CHROMA) return null
  const what = L < 0.3 ? 'black' : L > 0.9 ? 'white' : 'grey'
  return `${what} (OKLCH chroma ${C} under ${NEUTRAL_CHROMA}: no visible hue)`
}

export function rgbToHsl({ r, g, b }) {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const M = Math.max(R, G, B)
  const m = Math.min(R, G, B)
  const l = (M + m) / 2
  let h = 0
  let s = 0
  if (M !== m) {
    const d = M - m
    s = l > 0.5 ? d / (2 - M - m) : d / (M + m)
    h = M === R ? (G - B) / d + (G < B ? 6 : 0) : M === G ? (B - R) / d + 2 : (R - G) / d + 4
    h *= 60
  }
  return { h, s, l }
}

export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/**
 * The brand colour as the site can wear it. `opening` = template ground of the side the site opens on (mandatory),
 * `other` = template ground of the other side.
 * - Reads >= 3:1 on the opening ground: unchanged (lifted: false).
 * - Else every HSL lightness 0.000..1.000 (step 0.001) with the same hue and saturation is a candidate; ratios
 *   are measured on the rounded #rrggbb. Candidates must reach 3:1 on the opening ground (none: null, refused).
 *   Then, in order, keep only those that reach 3:1 on the other ground, then 4.5:1 on the other ground, when any
 *   do. Among the rest pick the one whose opening ratio is closest to 4.5:1 (from below, or reaching it), and on
 *   a tie the smallest lightness change.
 */
export function liftAccent(h, opening, other) {
  const from = h.toLowerCase()
  const before = { opening: contrastHex(from, opening), other: other ? contrastHex(from, other) : null }
  const hsl = rgbToHsl(parseHexColour(from))
  const base = {
    from,
    hue: +hsl.h.toFixed(1),
    saturation: +hsl.s.toFixed(3),
    lightnessFrom: +hsl.l.toFixed(3),
    grounds: { opening, other },
    before
  }
  if (before.opening >= MIN_RATIO) {
    return {
      ...base,
      lifted: false,
      to: from,
      lightnessTo: base.lightnessFrom,
      after: before,
      tier: 'reads as given'
    }
  }
  let cands = []
  const seen = new Set()
  for (let i = 0; i <= 1000; i++) {
    const l = i / 1000
    const x = hslToHex(hsl.h, hsl.s, l)
    if (seen.has(x)) continue
    seen.add(x)
    const o = contrastHex(x, opening)
    if (o < MIN_RATIO) continue
    cands.push({ hex: x, l, opening: o, other: other ? contrastHex(x, other) : null })
  }
  if (!cands.length) {
    return {
      ...base,
      lifted: null,
      to: null,
      refused: `no lightness of this hue reads ${MIN_RATIO}:1 on the opening ground ${opening}`
    }
  }
  let tier = `opening ground ${MIN_RATIO}:1 only (the other ground cannot reach ${MIN_RATIO}:1 at the same time)`
  if (other) {
    const t3 = cands.filter((c) => c.other >= MIN_RATIO)
    if (t3.length) {
      cands = t3
      tier = `${MIN_RATIO}:1 on both grounds`
    }
    const t45 = cands.filter((c) => c.other >= WORD_RATIO)
    if (t45.length) {
      cands = t45
      tier = `${MIN_RATIO}:1 on the opening ground, ${WORD_RATIO}:1 on the other ground`
    }
  }
  cands.sort(
    (p, q) =>
      Math.min(q.opening, WORD_RATIO) - Math.min(p.opening, WORD_RATIO) ||
      Math.abs(p.l - hsl.l) - Math.abs(q.l - hsl.l)
  )
  const best = cands[0]
  return {
    ...base,
    lifted: true,
    to: best.hex,
    lightnessTo: +rgbToHsl(parseHexColour(best.hex)).l.toFixed(3),
    direction: best.l > hsl.l ? 'lighter' : 'darker',
    after: { opening: best.opening, other: best.other },
    tier
  }
}
