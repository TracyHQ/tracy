// The look of a template's icon, read from its file (#380). A replaced icon may show another drawing, and nothing else about it
// may change: the file's pixel size, the glyph's size and place, the line weight and the backing all come from here.
// `looksDiffer` is the one judgement of "the same look", so what the picture stage draws and what the site check holds it to
// cannot drift apart.
import sharp from 'sharp'
import { iconStyleOf, sectionWeightOf } from './icon-style.js'

/**
 * @typedef {{ width: number, height: number, weight: string, stroke: number,
 *   glyph: { x: number, y: number, w: number, h: number },
 *   plate: { colour: string, opacity: number, radius: number, box: { x: number, y: number, w: number, h: number } } | null
 * }} IconLook `stroke`: the line's width against the file's side; `glyph` and `plate.box`: fractions of the file
 */

/**
 * How far two reads of one look may stand apart, measured on 504 Phosphor drawings in the template's weight against a template
 * icon: the mean-stroke read of one drawing strays (a lone dash reads several times its line, 3% read past 1.5), and the median
 * of a section does not. Drawn one weight heavier, the median reads 1.65; in the same weight, 1.10.
 */
const GLYPH_SLACK = 0.1
const STROKE_RATIO = 1.5
const PLATE_BOX_SLACK = 0.04
const PLATE_RADIUS_SLACK = 0.06
const PLATE_OPACITY_SLACK = 0.04

const round = (v) => Number(v.toFixed(4))

/** The box of a file's ink when it has no backing: every visible pixel is the glyph. */
async function inkBoxOf(bytes) {
  const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'none' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let [x0, x1, y0, y1] = [info.width, -1, info.height, -1]
  for (let p = 0; p < info.width * info.height; p += 1) {
    if (data[p * info.channels + 3] < 128) continue
    const x = p % info.width
    const y = Math.floor(p / info.width)
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  return {
    width: info.width,
    height: info.height,
    box: {
      x: round(x0 / info.width),
      y: round(y0 / info.height),
      w: round((x1 - x0 + 1) / info.width),
      h: round((y1 - y0 + 1) / info.height)
    }
  }
}

/**
 * @param {Uint8Array | Buffer | null} bytes the file
 * @returns {Promise<IconLook | null>} null when the file holds no icon that can be read
 */
export async function iconLookOf(bytes) {
  const style = await iconStyleOf(bytes)
  if (!style) return null
  const { width, height, box } = await inkBoxOf(bytes)
  const shape = style.groundShape
  const glyph = shape?.glyph ?? box
  return {
    width,
    height,
    weight: style.weight,
    stroke: round((style.stroke * Math.max(glyph.w * width, glyph.h * height)) / Math.max(width, height)),
    glyph,
    plate: shape
      ? { colour: shape.colour, opacity: shape.opacity, radius: shape.radius, box: shape.box }
      : null
  }
}

const sectionOf = (frame) => String(frame).split('.')[0]

/**
 * Each frame's look with its section's weight: the weight most of a section's icons measure, as the picture step takes it, so
 * one icon's stray read does not leave one card heavier than its row.
 * @param {Map<string, IconLook>} looks by frame id
 * @returns {Map<string, IconLook>}
 */
export function sectionLooks(looks) {
  const entries = [...looks]
  const weightOf = (section) =>
    sectionWeightOf(entries.filter(([frame]) => sectionOf(frame) === section).map(([, look]) => look))
  return new Map(entries.map(([frame, look]) => [frame, { ...look, weight: weightOf(sectionOf(frame)) }]))
}

const off = (a, b, slack) => Math.abs(a - b) > slack
const median = (list) => [...list].sort((a, z) => a - z)[Math.floor(list.length / 2)]

function plateDiffers(was, now) {
  if (!was && !now) return []
  if (!was) return ['it has a backing the template icon does not have']
  if (!now) return ['it has no backing, and the template icon has one']
  const said = []
  const box = ['x', 'y', 'w', 'h'].some((k) => off(was.box[k], now.box[k], PLATE_BOX_SLACK))
  if (box) said.push(`its backing covers ${now.box.w} of the file, the template's ${was.box.w}`)
  if (off(was.radius, now.radius, PLATE_RADIUS_SLACK))
    said.push(`its backing's corners are ${now.radius}, the template's ${was.radius}`)
  if (off(was.opacity, now.opacity, PLATE_OPACITY_SLACK))
    said.push(`its backing's opacity is ${now.opacity}, the template's ${was.opacity}`)
  return said
}

/**
 * What about a replaced icon's look differs from the icon it replaced; empty when it is the same look. Colour is not here: the
 * accent is meant to change. The line is judged over a section (`sectionLineDiffers`), since one drawing's read of it strays.
 * @param {IconLook} was @param {IconLook} now
 * @returns {string[]} one sentence per difference
 */
export function looksDiffer(was, now) {
  const said = plateDiffers(was.plate, now.plate)
  const side = (l) => Math.max(l.glyph.w, l.glyph.h)
  if (off(side(was), side(now), GLYPH_SLACK))
    said.push(`its drawing's size is ${side(now)} of the file, the template's ${side(was)}`)
  return said
}

/**
 * Whether a section's replaced icons are drawn in another line weight than the icons they replaced.
 * @param {Array<{ was: IconLook, now: IconLook }>} pairs
 * @returns {string | null} the sentence, or null when they are drawn in the same weight
 */
export function sectionLineDiffers(pairs) {
  const ratio = median(pairs.map(({ was, now }) => now.stroke / was.stroke))
  if (ratio <= STROKE_RATIO && ratio >= 1 / STROKE_RATIO) return null
  return `its line is ${ratio.toFixed(2)} times the template's across this section`
}
