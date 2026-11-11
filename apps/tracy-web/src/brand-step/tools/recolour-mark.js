// recolour_mark(mark, side, mode?, colour?, mask?, nameHint?): for a side where the look_logo reviewer failed the
// ORIGINAL mark. Default colour: the side's heading colour (kit); side ground: the template's ground of that side.
// Modes: invert (default for a mark with a fill mask written by cut_mark), palette (default for a mark with no mask
// and at most 2 exact colours, i.e. a make_icon icon), solid (default otherwise, e.g. a lettermark). Ported from the
// approved lab's recolour-mark. Never overwrites: the new file is mark/recoloured.<side>.png (or nameHint), versioned.
import { BrandToolError, hex, imageBytes, imagePath, parseHexColour, raw, sharp } from './common.js'
import { sideText } from '../kit-grounds.js'
import { invertMode, paletteMode, solidMode } from './recolour-modes.js'

const MODES = ['invert', 'solid', 'palette']

export const tool = {
  name: 'recolour_mark',
  description:
    "Fixes a mark for one side where the reviewer failed the original. A cut mark is inverted: a negative on that side (darkest parts take the side's heading colour, enclosed ground takes the side's background, tones in between keep their order). An icon keeps every colour that reads 3:1 on that side's background and a colour that does not takes the side's heading colour. A lettermark turns into one solid colour. Returns a new file; the original stays.",
  inputSchema: {
    type: 'object',
    properties: {
      mark: { type: 'string', description: 'Path of the mark file to fix.' },
      side: { type: 'string', enum: ['light', 'dark'] },
      mode: {
        type: 'string',
        enum: MODES,
        description: 'Only to force a mode; the default follows the mark.'
      },
      colour: { type: 'string', description: "#rrggbb; default the side's template heading colour." },
      mask: { type: 'string', description: 'Fill mask of the mark; default the sidecar <mark>.mask.png.' },
      nameHint: { type: 'string', description: 'Run-folder path to write to (a new version when taken).' }
    },
    required: ['mark', 'side'],
    additionalProperties: false
  },
  async run({ mark, side, mode: asked, colour: given, mask: maskRef, nameHint }, ctx) {
    if (!mark || !side) throw new BrandToolError('usage: recolour_mark(mark, side)')
    if (!['light', 'dark'].includes(side)) throw new BrandToolError('side is light or dark')
    const { files, kit } = ctx
    const markFile = imagePath(files, mark)
    const colour = (given ?? sideText(kit)[side]).toLowerCase()
    if (!parseHexColour(colour)) throw new BrandToolError('bad colour: #rrggbb')
    const maskFile = maskRef ? imagePath(files, maskRef) : markFile.replace(/\.png$/i, '.mask.png')
    const hasMask = files.has(maskFile)
    if (maskRef && !hasMask) throw new BrandToolError(`mask not found: ${maskRef}`)
    const { data, w, h } = await raw(imageBytes(files, markFile))
    const n = w * h
    const palette = new Map()
    for (let i = 0; i < n; i++)
      if (data[i * 4 + 3] > 0) {
        const k = hex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
        palette.set(k, (palette.get(k) ?? 0) + 1)
      }
    const mode = asked ?? (hasMask ? 'invert' : palette.size <= 2 ? 'palette' : 'solid')
    if (!MODES.includes(mode)) throw new BrandToolError('mode is invert, solid or palette')
    if (mode === 'palette' && (hasMask || palette.size > 2))
      throw new BrandToolError(
        'palette needs a mark with no fill mask and at most 2 exact colours (a make_icon icon)'
      )
    if (mode === 'invert' && !hasMask)
      throw new BrandToolError(
        'invert needs the fill mask cut_mark writes (<mark>.mask.png): this mark has none, use mode solid'
      )
    const ground = kit.site.brandColours.sides.find((s) => s.groundSide === side)?.ground?.toLowerCase()
    if (!ground) throw new BrandToolError(`no template ground for side ${side} in the kit`)
    let mask = null
    if (hasMask) {
      const m = await sharp(files.read(maskFile))
        .extractChannel(0)
        .raw()
        .toBuffer({ resolveWithObject: true })
      if (m.info.width !== w || m.info.height !== h)
        throw new BrandToolError(`mask size ${m.info.width}x${m.info.height} differs from the mark ${w}x${h}`)
      mask = m.data
    }
    const args = { data, n, palette, ground, colour, mask, maskFile }
    const done =
      mode === 'palette' ? paletteMode(args) : mode === 'solid' ? solidMode(args) : invertMode(args)
    if (done.error) {
      if (mode === 'invert' && done.error.startsWith('the mask has no kept fill'))
        throw await emptyFillError(files, markFile, side)
      throw new BrandToolError(done.error)
    }
    const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer()
    const file = files.write(nameHint ?? `mark/recoloured.${side}.png`, png)
    return {
      ...done.result,
      file,
      side,
      mode,
      colour,
      from: given ? 'given' : 'template text colour of the side (kit)',
      figurePixels: done.figure,
      note:
        mode === 'palette'
          ? "icon colours under 3:1 on this side's ground took the side's heading colour, the others stay. Record this file in logo.mark.recoloured.<side> and look at the logo again"
          : mode === 'invert'
            ? 'a negative of the mark on this side: figure tones run from the ground towards the heading colour by their original lightness, the kept fill takes the side ground. Record this file in logo.mark.recoloured.<side> and look at the logo again'
            : 'only the figure changes colour; detail drawn by colour differences inside the figure is lost. Record this file in logo.mark.recoloured.<side> and look at the logo again'
    }
  }
}

/** Recovery uses the existing cut proof and tools; it never recolours or approves a file automatically. */
async function emptyFillError(files, markFile, side) {
  const warning =
    'Solid mode discards internal colour detail; use it only deliberately, and review the result with look_logo before use.'
  const proof = markFile.replace(/\.png$/i, '.on-white.png')
  if (files.has(proof)) {
    try {
      const { data, w, h } = await raw(files.read(proof))
      let opaque = true
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) opaque = false
      if (opaque) {
        const cut = { mediaId: proof, box: [0, 0, w, h] }
        return new BrandToolError(
          `The mask has no kept fill: nothing to invert. Recut the existing opaque proof with cut_mark(${JSON.stringify(cut)}), then call recolour_mark on the returned file for side ${side} with its new fill mask. Fit and review the result with look_logo before use. ${warning}`,
          { recovery: { cut, side, next: ['recolour_mark', 'fit_logo', 'look_logo'] } }
        )
      }
    } catch {
      // An unreadable proof cannot establish the supported recovery input.
    }
  }
  return new BrandToolError(
    `The mask has no kept fill: nothing to invert, and no readable opaque cut proof is available. ${warning}`
  )
}
