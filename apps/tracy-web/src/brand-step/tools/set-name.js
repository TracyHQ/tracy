// set_name(text): sets the name in the template heading font (glyph outlines of the font file, no text engine, no
// model). Two variants, each one transparent PNG per side, in that side's template heading colour (read from the kit;
// text colours never change):
//   one line   name/name.light.png, name/name.dark.png
//   two lines  name/name-2l.light.png, name/name-2l.dark.png: split at a word boundary, the most balanced split (the
//              longer line as short as possible), left aligned, every line at the same letter height, line gap 0.3 of
//              the letter height. None for a one-word name.
// Writes name/name.json (compose_logo reads it). Never overwrites: run N >= 2 writes the same files with ".vN".
import { BrandToolError, runSuffix, sharp, sideColours, writeJson } from './common.js'
import { textSvg, twoLineSplit } from './text-outline.js'

export const tool = {
  name: 'set_name',
  description:
    "Sets the name in the template's heading font, in two variants: one line, and two lines split at a word boundary (the most balanced split; none for a one-word name). Each variant is one transparent image per side (light and dark), in that side's template heading colour.",
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'The exact business name.' } },
    required: ['text'],
    additionalProperties: false
  },
  async run({ text, height }, ctx) {
    if (typeof text !== 'string' || !text.trim()) throw new BrandToolError('usage: set_name(text)')
    const H = Number(height ?? 160) // letter (cap) height in px of every line
    const GAP = Math.round(H * 0.3)
    const colours = sideColours(ctx.kit)
    const SUF = runSuffix(ctx.files, 'name/name.json')
    const line = async (t, colour) => {
      const s = textSvg(ctx.font, t, { size: 1000, colour })
      const w = Math.round((s.width * H) / s.height)
      return { buf: await sharp(Buffer.from(s.svg)).resize(w, H).png().toBuffer(), width: w }
    }
    const split = twoLineSplit(ctx.font, text)
    const one = { files: {}, width: 0, height: H }
    const two = split
      ? { lines: split.lines, files: {}, width: 0, height: H * 2 + GAP, lineGapPx: GAP }
      : null
    for (const side of ['light', 'dark']) {
      const l = await line(text, colours[side])
      one.files[side] = ctx.files.write(`name/name.${side}${SUF}.png`, l.buf)
      one.width = l.width
      if (two) {
        const [p, q] = [await line(split.lines[0], colours[side]), await line(split.lines[1], colours[side])]
        const W = Math.max(p.width, q.width)
        const sheet = await sharp({
          create: { width: W, height: two.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
        })
          .composite([
            { input: p.buf, left: 0, top: 0 },
            { input: q.buf, left: 0, top: H + GAP }
          ])
          .png()
          .toBuffer()
        two.files[side] = ctx.files.write(`name/name-2l.${side}${SUF}.png`, sheet)
        two.width = W
      }
    }
    const info = {
      ok: true,
      text,
      rendersAs: text.toUpperCase(),
      font: ctx.font.family,
      letterHeightPx: H,
      files: one.files,
      width: one.width,
      height: one.height,
      oneLine: one,
      twoLines: two,
      colours: { light: colours.light, dark: colours.dark },
      coloursFrom: colours.from,
      note: [
        'A capitals-only heading font prints the name in capitals, which counts as the exact name',
        two ? null : 'one word: no two-line variant'
      ].filter(Boolean)
    }
    const sidecar = writeJson(ctx.files, `name/name${SUF}.json`, info)
    return { ...info, sidecar }
  }
}
