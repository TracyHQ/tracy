/**
 * One colour literal → its hex and alpha: `#abc`, `#abcd`, `#aabbcc`, `#aabbccdd`, `rgb(…)`, `hsl(…)`
 * or one of a few names. PURE.
 */

const NAMED = {
  white: '#ffffff',
  black: '#000000',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  orange: '#ffa500',
  yellow: '#ffff00',
  purple: '#800080',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000'
}

/** `#abc`, `#abcd`, `#aabbcc`, `#aabbccdd`, `rgb(…)`, `hsl(…)` or a name → `{ hex, alpha }`, or null. */
export function parseColour(text) {
  const t = text.trim().toLowerCase()
  if (NAMED[t]) return { hex: NAMED[t], alpha: 1 }
  let m = /^#([0-9a-f]{3,8})$/.exec(t)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    return { hex: `#${h.slice(0, 6)}`, alpha: h.length === 8 ? Number.parseInt(h.slice(6), 16) / 255 : 1 }
  }
  m = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(t)
  if (!m) return null
  const parts = m[2].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return null
  const num = (s, scale) => (s.endsWith('%') ? (Number.parseFloat(s) / 100) * scale : Number.parseFloat(s))
  const alpha = parts[3] === undefined ? 1 : num(parts[3], 1)
  let rgb
  if (m[1].startsWith('rgb')) rgb = parts.slice(0, 3).map((s) => num(s, 255))
  else {
    const h = Number.parseFloat(parts[0]) / 360
    const s = num(parts[1], 1)
    const l = num(parts[2], 1)
    const f = (n) => {
      const k = (n + h * 12) % 12
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    rgb = [f(0), f(8), f(4)].map((v) => v * 255)
  }
  if (rgb.some((v) => Number.isNaN(v)) || Number.isNaN(alpha)) return null
  const hex = `#${rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
  return { hex, alpha }
}
