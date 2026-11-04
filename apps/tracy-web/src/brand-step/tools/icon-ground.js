// The plain ground the icon drawing is asked to sit on. Ported from the approved lab's icon-quantize.
import { parseHexColour } from '../colour-math.js'

/**
 * Ground to use behind the icon when asking the model: the plain ground farthest from every requested colour,
 * so no colour can be mistaken for ground. White first, then black, then mid grey.
 */
export function pickGround(colours) {
  const cs = colours.map(parseHexColour)
  const score = (g) => Math.min(...cs.map((c) => Math.hypot(c.r - g.r, c.g - g.g, c.b - g.b)))
  const candidates = [
    ['white', '#ffffff'],
    ['black', '#000000'],
    ['mid grey', '#808080']
  ]
  for (const [name, hexValue] of candidates)
    if (score(parseHexColour(hexValue)) >= 120) return { name, hex: hexValue }
  return candidates
    .map(([name, hexValue]) => ({ name, hex: hexValue, s: score(parseHexColour(hexValue)) }))
    .sort((p, q) => q.s - p.s)[0]
}
