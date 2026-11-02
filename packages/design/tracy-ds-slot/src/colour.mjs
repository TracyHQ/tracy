/**
 * Colour reading for the slot: strict hex only. A truncated hex (`#1e1e1`, measured in 99 Refero
 * systems) or a gradient is NOT repaired — a guessed colour is worse than an empty slot.
 */

/** @param {unknown} v @returns {{ r: number, g: number, b: number } | null} */
export function parseHex(v) {
  if (typeof v !== 'string') return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

/** @param {{ r: number, g: number, b: number }} c */
export function toHex(c) {
  const p = (n) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`
}

/** WCAG relative luminance. */
export function luminance(c) {
  const f = (n) => {
    const s = n / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

/** WCAG contrast ratio of two hex colours, or null when either is not a strict hex. */
export function contrast(a, b) {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return null
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/** The higher-contrast of white/black on a background: what text on an accent fill is. */
export function readableOn(bg) {
  const c = parseHex(bg)
  if (!c) return null
  return contrast('#ffffff', bg) >= contrast('#000000', bg) ? '#ffffff' : '#000000'
}

/** Mix `a` toward `b` by `t` (0..1), in sRGB: how hover/active/soft tints are derived. */
export function mix(a, b, t) {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return null
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t })
}

/** Max channel distance, the metric `design-check` already uses. */
export function distance(a, b) {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return Infinity
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b))
}

/**
 * `color` moved toward `toward` in 2% steps until it reads at `min`:1 on `bg` — the smallest change
 * that makes a system's text readable, keeping its hue. Returns the colour unchanged when it already
 * reads, and null when no step reaches `min` (the caller then keeps the source colour and flags it).
 */
export function readable(color, bg, toward, min = 4.5) {
  if ((contrast(color, bg) ?? 0) >= min) return color
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const c = mix(color, toward, t)
    if ((contrast(c, bg) ?? 0) >= min) return c
  }
  return null
}

/** HSL (h 0..360, s and l 0..1) of a parsed colour. */
function hslOf(/** @type {{ r: number, g: number, b: number }} */ c) {
  const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

/** The colour of HSL `h`, `s`, `l`. */
function fromHsl(/** @type {number} */ h, /** @type {number} */ s, /** @type {number} */ l) {
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
  return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 })
}

/**
 * `color` made to read at `min`:1 on every one of `grounds` by its LIGHTNESS alone, keeping its hue and saturation
 * (HSL): away from the first ground's lightness first, then the other way, in steps of 1%. Mixing toward white or
 * black instead greys a deep colour on its way (moss #042515 mixed toward white read 4.5:1 on #121111 as a grey
 * #87978f, which no longer looks like the brand: JA Boxing, 02/11/2026). The brand step's shift; null when no
 * lightness reads.
 * @param {string} color @param {string[]} grounds @param {number} [min]
 */
export function readableLightness(color, grounds, min = 4.5) {
  const c = parseHex(color)
  const gs = grounds.filter((g) => parseHex(g))
  if (!c || gs.length === 0) return null
  const worst = (/** @type {string} */ x) => Math.min(...gs.map((g) => contrast(x, g) ?? 0))
  if (worst(color) >= min) return color
  const { h, s, l } = hslOf(c)
  const up = luminance(/** @type {any} */ (parseHex(gs[0]))) < 0.3
  for (const dir of up ? [1, -1] : [-1, 1])
    for (let k = 1; k <= 100; k++) {
      const nl = l + dir * k * 0.01
      if (nl < 0 || nl > 1) break
      const x = fromHsl(h, s, nl)
      if (worst(x) >= min) return x
    }
  return null
}

/**
 * The fill and text a call to action wears on a band whose ground is `ground`: the system's button
 * pair (`accent` fill, `on` text), checked against the band. The fill must stand out from the ground
 * (3:1, WCAG non-text contrast) and the text read on the fill (4.5:1). When the accent does not stand
 * out but its text colour does (a black accent on an ink band, a green button on a band painted with
 * that same green), the pair is turned over (`on` fill, `accent` text): still the system's two
 * colours. Null when neither stands out, or the pair does not read: the caller then leaves the
 * button as it is. `hover` is the system's hover fill when its text still reads on it.
 * @returns {{ fill: string, text: string, hover: string, turned: boolean } | null}
 */
export function buttonPair(accent, on, hover, ground) {
  if (!parseHex(accent) || !parseHex(on) || !parseHex(ground)) return null
  if ((contrast(on, accent) ?? 0) < 4.5) return null
  if ((contrast(accent, ground) ?? 0) >= 3) {
    const h = parseHex(hover) && (contrast(on, hover) ?? 0) >= 4.5 ? hover : accent
    return { fill: accent, text: on, hover: h, turned: false }
  }
  if ((contrast(on, ground) ?? 0) >= 3) return { fill: on, text: accent, hover: on, turned: true }
  return null
}
