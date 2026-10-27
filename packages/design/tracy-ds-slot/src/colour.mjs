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
