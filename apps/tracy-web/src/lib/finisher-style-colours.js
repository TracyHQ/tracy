// The colour pair check of the finisher's style allow list (ADR 0044, decision 30): a style order that sets both a text colour
// and a backing colour in the same rule must leave the text readable on it. Both colours known, a WCAG contrast under 3:1 is
// refused, so a repair can never paint text the colour of its ground. A colour code cannot read (a gradient, a named colour
// outside the short list, a backing layer that lets the picture show through) is not judged here; the checker still is.

/** The least contrast the allow list lets a text colour have against the backing colour of the same rule. */
export const MIN_CONTRAST = 3

const NAMED = { white: [255, 255, 255], black: [0, 0, 0] }

/** `[r, g, b, a]` of a hex, rgb() or rgba() colour, or of white or black; null when code cannot read it. */
export function parsedColour(value) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
  if (NAMED[v]) return [...NAMED[v], 1]
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1]
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    const [r, g, b, a = 255] = full.match(/../g).map((p) => Number.parseInt(p, 16))
    return [r, g, b, a / 255]
  }
  const parts = /^rgba?\(([^()]+)\)$/
    .exec(v)?.[1]
    ?.split(/[\s,/]+/)
    .filter(Boolean)
  if (!parts || parts.length < 3 || parts.length > 4) return null
  const [r, g, b] = parts.slice(0, 3).map((p) => (p.endsWith('%') ? Number.parseFloat(p) * 2.55 : Number(p)))
  const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1)
  return [r, g, b, alpha].every(Number.isFinite) ? [r, g, b, alpha] : null
}

const channel = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

/** The WCAG contrast of a text colour on an opaque ground, the text's own alpha blended over that ground. */
export function contrastOf(text, ground) {
  const a = text[3]
  const shown = [0, 1, 2].map((i) => text[i] * a + ground[i] * (1 - a))
  const [hi, lo] = [luminance(shown), luminance(ground)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Why the rule's text colour is refused against its backing colour, or null. Judged only when both are known and the
 * backing colour is opaque: a backing layer with alpha lets the picture beneath show, so its ground is not known here.
 * @param {[string, string][]} entries the order's declarations
 */
export function colourPairRefusal(entries) {
  const of = (name) => entries.find(([p]) => String(p).trim().toLowerCase() === name)?.[1]
  const text = of('color')
  const groundValue = of('background-color') ?? of('background')
  if (text === undefined || groundValue === undefined) return null
  const fg = parsedColour(text)
  const bg = parsedColour(groundValue)
  if (!fg || !bg || bg[3] < 1) return null
  const ratio = contrastOf(fg, bg)
  return ratio < MIN_CONTRAST
    ? `color: ${text}: too close to the background ${groundValue} of the same rule (contrast ${ratio.toFixed(2)}:1, under ${MIN_CONTRAST}:1), the text would not be seen`
    : null
}
