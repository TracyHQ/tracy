// fit_logo(logo, spot): `logo` is the one-line logo of a side from compose_logo (its sidecar logo/logo[.vN].json sits
// in the same folder, with the two-line variant and the side's mark). The logo's side must be the spot's ground side.
// Scales to contain in the spot frame, at 2x, transparent, and picks, in this order:
//   1. the one-line logo, when the name's letter height in the spot reaches 14 px (1x);
//   2. else the two-line logo, when each line reaches 14 px;
//   3. else the side's mark alone, except a phone menu retains the best name variant.
// A name-only logo (compose_logo nameOnly) has no mark to fall back to: a spot too small for either variant shows
// the larger name variant, and the note says so.
// Reports which (`shows`: logo | logo-2-lines | mark) and the letter height of every candidate.
// Never overwrites: the file is spots/<spot>.png, then spots/<spot>.vN.png (`run` = N).
import path from 'node:path'
import { BrandToolError, MIN_LETTER_PX, readJson, sharp, sidecarsIn } from './common.js'

export const tool = {
  name: 'fit_logo',
  description:
    "Crops, pads and scales to a spot at 2x, and picks what the spot shows: the one-line logo when the name's letter height reaches 14 px; else the two-line logo when each line reaches 14 px; else the mark alone (phone menus always retain the best name variant). It says which (`shows`: `logo`, `logo-2-lines` or `mark`).",
  inputSchema: {
    type: 'object',
    properties: {
      logo: {
        type: 'string',
        description: "Path of the one-line logo of the spot's ground side (logo.<side>.png)."
      },
      spot: { type: 'string', description: 'The id of a kit logo spot.' },
      align: { type: 'string', enum: ['left', 'center'] }
    },
    required: ['logo', 'spot'],
    additionalProperties: false
  },
  async run({ logo, spot: spotId, align }, ctx) {
    if (!logo || !spotId) throw new BrandToolError('usage: fit_logo(logo, spot)')
    const spots = ctx.kit.site.logoSpots
    const spot = spots.find((s) => s.id === spotId)
    if (!spot) throw new BrandToolError(`unknown spot ${spotId}`, { spots: spots.map((s) => s.id) })
    const side = spot.ground.side
    const dir = path.posix.dirname(logo)
    const cars = sidecarsIn(ctx.files, dir, 'logo')
    if (!cars.length)
      throw new BrandToolError('no logo.json next to the logo: compose it with compose_logo first')
    let entry = null
    for (const c of cars) {
      const m = readJson(ctx.files, c)
      const e = Object.entries(m.sides).find(
        ([, s]) => path.posix.normalize(s.file) === path.posix.normalize(logo)
      )
      if (e) {
        entry = e
        break
      }
    }
    if (!entry)
      throw new BrandToolError(
        'this file is not a one-line logo of any compose_logo run (pass logo.<side>[.vN].png)'
      )
    const [logoSide, info] = entry
    if (logoSide !== side)
      throw new BrandToolError(`logo of the ${logoSide} side given for a ${side} spot: pass logo.${side}.png`)

    /** Letter height (1x px) of a variant's name when the variant is contained in the spot frame. */
    const letterIn = (v) =>
      +(v.letterHeight * Math.min(spot.width / v.width, spot.height / v.height)).toFixed(1)
    const one = info.variants?.oneLine ?? {
      file: info.file,
      width: info.width,
      height: info.height,
      letterHeight: info.nameBox[3]
    }
    const two = info.variants?.twoLines ?? null
    const candidates = [
      { shows: 'logo', file: one.file, letter: letterIn(one) },
      ...(two ? [{ shows: 'logo-2-lines', file: two.file, letter: letterIn(two), lines: two.lines }] : [])
    ]
    const nameOnly = !info.mark
    // A phone menu must identify the business even when its compact frame cannot meet the preferred letter height.
    const keepName = nameOnly || spot.where === 'offcanvas'
    const pick =
      candidates.find((c) => c.letter >= MIN_LETTER_PX) ??
      (keepName
        ? candidates.reduce((best, c) => (c.letter > best.letter ? c : best))
        : { shows: 'mark', file: info.mark, letter: null })

    const W = spot.width * 2
    const H = spot.height * 2
    const position = align === 'center' ? 'centre' : 'left'
    const input = await sharp(ctx.files.read(pick.file)).trim({ threshold: 0 }).png().toBuffer()
    const png = await sharp(input)
      .resize(W, H, { fit: 'contain', position, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    const outFile = ctx.files.write(`spots/${spotId}.png`, png)
    const RUN = Number(/\.v(\d+)\.png$/.exec(outFile)?.[1] ?? 1)
    const m = await sharp(input).metadata()
    const s1 = Math.min(spot.width / m.width, spot.height / m.height)
    return {
      ok: true,
      file: outFile,
      run: RUN,
      spot: spotId,
      frame: [spot.width, spot.height],
      size2x: [W, H],
      ground: spot.ground,
      writable: spot.setting !== null,
      setting: spot.setting,
      shows: pick.shows,
      from: pick.file,
      nameLetterHeightPx: pick.letter,
      minLetterPx: MIN_LETTER_PX,
      candidates: candidates.map((c) => ({
        shows: c.shows,
        nameLetterHeightPx: c.letter,
        reaches14: c.letter >= MIN_LETTER_PX
      })),
      drawnAt1x: [Math.round(m.width * s1), Math.round(m.height * s1)],
      note: [
        pick.shows === 'logo-2-lines'
          ? `one line would be ${candidates[0].letter} px (< ${MIN_LETTER_PX}): name on two lines`
          : null,
        pick.shows === 'mark'
          ? `name under ${MIN_LETTER_PX} px ${two ? 'on one line and on two lines' : 'on one line (one word: no two-line variant)'}: mark alone`
          : null,
        keepName && pick.letter < MIN_LETTER_PX
          ? `the ${nameOnly ? 'name-only logo' : 'phone menu'} keeps the business name: ${pick.letter} px (< ${MIN_LETTER_PX}) in this spot`
          : null,
        spot.setting === null ? 'no setting can write this spot' : null
      ].filter(Boolean)
    }
  }
}
