// Draws one painted frame from its recipe and the colours of its roles (ADR 0043 section 1a), with the picture step's own
// drawing code and no model. Anything the recipe does not allow to be drawn exactly as recorded is a `problem`, in words:
// another icon, a figure instead of letters or a guessed colour would be a substitute nobody chose.
import { createHash } from 'node:crypto'
import { initialsAvatar } from '../lib/initials-avatar.js'
import { backdropComposite } from '../site-pictures/cutout-backdrop-draw.js'
import { iconPicture } from '../site-pictures/icons/icon-render.js'
import { hasPhosphorIcon, PHOSPHOR_SET } from '../site-pictures/icons/phosphor-set.js'
import { backdropProblem, paintProblem, roleOf } from '../site-pictures/paint.js'

class DrawProblem extends Error {}

const refuse = (words) => {
  throw new DrawProblem(words)
}
const refuseIf = (words) => {
  if (words) refuse(words)
}

/** The size to draw at: the frame's, as wide as the slot's fit asks. Only for what code draws sharp at any size. */
function sizeFor(item, fit) {
  const min = Number.isInteger(fit?.minWidth) ? fit.minWidth : 0
  if (min <= item.width) return { width: item.width, height: item.height }
  return { width: min, height: Math.round((min * item.height) / item.width) }
}

/**
 * The backing a template icon has, in the brand's accent when it was the template's accent (a tint of it) and otherwise as the
 * template drew it: a neutral disc is not a brand colour, and the accent-only style leaves the template's neutrals as they are.
 */
function plateOf(look, colourOf, templateAccent) {
  if (!look.plate) return null
  const follows = roleOf(look.plate.colour, templateAccent) === 'accent' && Boolean(templateAccent)
  return {
    ...look.plate,
    glyph: look.glyph,
    colour: follows ? colourOf('accent') : look.plate.colour,
    follows: follows ? 'accent' : 'template'
  }
}

/** With the template icon's look, its size, weight and backing are that look's: only the drawing and the accent change. */
async function drawIconLike(item, look, colourOf, templateAccent) {
  const { icon } = item.draw
  const colour = colourOf(item.paint[item.holds === 'dark' ? 'dark' : 'light'].glyph)
  const plate = plateOf(look, colourOf, templateAccent)
  const made = await iconPicture({
    glyph: icon,
    weight: look.weight,
    width: look.width,
    height: look.height,
    colour,
    ground: plate,
    glyphBox: look.glyph
  })
  return {
    ...made,
    drawnIn: { glyph: colour, plate: plate?.colour ?? null, plateFollows: plate?.follows ?? null }
  }
}

async function drawIcon(item, colourOf, fit, look, templateAccent) {
  refuseIf(paintProblem(item.paint, 'icon'))
  const { icon, set, weight } = item.draw ?? {}
  if (set !== PHOSPHOR_SET)
    refuse(`this icon was chosen from ${set}, and this server draws from ${PHOSPHOR_SET}`)
  if (!hasPhosphorIcon(icon)) refuse(`the icon set has no icon named ${icon}`)
  if (look) return drawIconLike(item, look, colourOf, templateAccent)
  const variant = item.paint[item.holds === 'dark' ? 'dark' : 'light']
  const colour = colourOf(variant.glyph)
  const plate = variant.plate ? colourOf(variant.plate.role) : null
  const made = await iconPicture({
    glyph: icon,
    weight,
    ...sizeFor(item, fit),
    colour,
    ground: variant.plate ? { ...variant.plate, colour: plate } : null
  })
  return { ...made, drawnIn: { glyph: colour, plate } }
}

async function drawInitials(item, colourOf, fit) {
  refuseIf(paintProblem(item.paint, 'initials'))
  const letters = String(item.draw?.letters ?? '')
  if (!/^[a-z]{1,2}$/i.test(letters)) refuse(`the letters ${JSON.stringify(letters)} cannot be drawn`)
  // `initialsAvatar` takes the words' colour from its ground, which is what the role on-accent says.
  if (item.paint.foreground !== 'on-accent')
    refuse(`initials are drawn in on-accent, and this recipe asks for ${item.paint.foreground}`)
  const background = colourOf(item.paint.background)
  const made = await initialsAvatar({ ...sizeFor(item, fit), initials: letters, colours: [background] })
  return { ...made, drawnIn: { background } }
}

/** The figure over its disc and bands, as one file: the door takes one path, and the disc leaves the corners clear. */
async function drawBackdrop(item, colourOf, figures) {
  const { backdrop: shape, figure: sitePath } = item.draw ?? {}
  refuseIf(backdropProblem({ shape, paint: item.paint, preview: item.preview }))
  const figure = figures.get(sitePath)
  if (!figure) refuse(`the package does not upload its figure ${sitePath}`)
  const colours = {
    circle: colourOf(item.paint.circle),
    stripes: shape.stripes ? colourOf(item.paint.stripes) : null
  }
  const { png, width, height } = await backdropComposite(figure, { shape }, colours)
  return {
    bytes: png,
    ext: 'png',
    width,
    height,
    sha256: createHash('sha256').update(png).digest('hex'),
    drawnIn: colours
  }
}

/**
 * @param {object} item one entry of the package's `painted`
 * @param {Record<string, string | undefined>} colours a colour per role, `#rrggbb`; what the brand does not hold is absent
 * @param {{ fit?: object, figures: Map<string, Buffer>, look?: import('../site-pictures/icons/template-icon-look.js').IconLook | null,
 *   templateAccent?: string | null }} where the slot's fit, the package's files by site path, and for an icon the look of the
 *   template icon it replaces and the accent that template was drawn in
 * @returns {Promise<{ bytes: Buffer, ext: string, width: number, height: number, sha256: string, drawnIn: object }
 *   | { problem: string }>}
 */
export async function drawPainted(item, colours, { fit, figures, look = null, templateAccent = null }) {
  const colourOf = (role) => {
    if (!/^#[0-9a-f]{6}$/i.test(String(colours[role])))
      refuse(`the brand file holds no colour for the role ${role}`)
    return colours[role]
  }
  try {
    if (item.kind === 'backdrop') return await drawBackdrop(item, colourOf, figures)
    if (item.kind === 'initials') return await drawInitials(item, colourOf, fit)
    if (item.kind === 'icon') return await drawIcon(item, colourOf, fit, look, templateAccent)
    return { problem: `a painted frame of kind ${item.kind} has no drawing` }
  } catch (error) {
    if (error instanceof DrawProblem) return { problem: error.message }
    throw error
  }
}
