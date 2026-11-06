// Invented template icons, drawn by code: a house outline on a disc, on a faint tint, or on nothing. No real picture.
import sharp from 'sharp'

const HOUSE = 'M38 66 L75 30 L112 66 L112 118 L38 118 Z'

/**
 * A template icon as its file. `stroke` is in file pixels on a 150 px box, so a look can be asked for at any weight.
 * @param {{ size?: number, stroke?: number, ink?: string, disc?: string | null, opacity?: number, inset?: number }} [input]
 */
export async function templateIcon({
  size = 150,
  stroke = 3,
  ink = '#d83a3a',
  disc = null,
  opacity = 1,
  inset = 0
} = {}) {
  const r = 75 - inset
  const backing = disc ? `<circle cx="75" cy="75" r="${r}" fill="${disc}" fill-opacity="${opacity}"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 150 150">${backing}<path d="${HOUSE}" fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linejoin="round"/></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}
