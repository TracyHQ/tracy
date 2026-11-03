// make_lettermark(letters, accent): the letters in the template heading font (glyph outlines) centred in a rounded
// square filled with the accent; the letters take black or white, whichever reads better on the accent.
// Transparent 512 x 512 PNG, written to mark/lettermark.png (a new version each call).
import { BrandToolError, contrastHex, sharp } from './common.js'
import { textSvg } from './text-outline.js'

export const tool = {
  name: 'make_lettermark',
  description:
    "Draws the letters in the template's heading font inside a simple rounded square filled with the accent; the letters take black or white, whichever reads. Returns a transparent square mark (512).",
  inputSchema: {
    type: 'object',
    properties: {
      letters: { type: 'string', description: '1 to 3 letters or digits (the initials).' },
      accent: { type: 'string', description: 'The accent the site wears on the side, #rrggbb.' }
    },
    required: ['letters', 'accent'],
    additionalProperties: false
  },
  async run({ letters, accent }, ctx) {
    if (!letters || !accent) throw new BrandToolError('usage: make_lettermark(letters, accent)')
    if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new BrandToolError('accent must be #rrggbb')
    if (!/^[\p{L}\p{N}]{1,3}$/u.test(letters)) throw new BrandToolError('letters: 1 to 3 letters or digits')
    const S = 512
    const pad = 16
    const side = S - pad * 2
    const radius = Math.round(side * 0.18)
    const onWhite = contrastHex('#ffffff', accent)
    const onBlack = contrastHex('#000000', accent)
    const ink = onWhite >= onBlack ? '#ffffff' : '#000000'
    // letters are text on the accent: hard rule 3:1 (black or white always reaches it; kept as a guard)
    if (Math.max(onWhite, onBlack) < 3) throw new BrandToolError('letters do not reach 3:1 on this accent')
    // letters: cap height 50% of the square, then shrunk to fit 72% of its width
    const t0 = textSvg(ctx.font, letters, { size: 1000, colour: ink })
    const scale = Math.min((side * 0.5) / t0.height, (side * 0.72) / t0.width)
    const tw = Math.round(t0.width * scale)
    const th = Math.round(t0.height * scale)
    const text = await sharp(Buffer.from(t0.svg)).resize(tw, th).png().toBuffer()
    const square = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect x="${pad}" y="${pad}" width="${side}" height="${side}" rx="${radius}" ry="${radius}" fill="${accent}"/></svg>`
    const png = await sharp(Buffer.from(square))
      .composite([{ input: text, left: Math.round((S - tw) / 2), top: Math.round((S - th) / 2) }])
      .png()
      .toBuffer()
    const file = ctx.files.write('mark/lettermark.png', png)
    return {
      ok: true,
      file,
      size: [S, S],
      letters,
      font: ctx.font.family,
      accent,
      letterColour: ink,
      letterContrast: Math.max(onWhite, onBlack),
      letterCapHeightPx: th
    }
  }
}
