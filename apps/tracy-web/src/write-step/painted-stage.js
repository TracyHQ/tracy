// The painted frames of a picture package (ADR 0043 section 1a, ADR 0044 decision 4): initials tiles, icons and the backdrop
// behind a cut-out figure carry colour roles, not colours, and the write step resolves the roles from the brand file.
//
// A frame that takes HTML would use the Design system's accent variable. None does on the door there is: a contract slot
// refuses `<` and `>` (`SLOT_NOT_CONTENT`), and an image slot takes a png, jpg or webp path that is on the site, so an SVG
// is refused too. So each frame here is a drawn file, written like any other picture, and its report line says it is
// drawn again when the Design system changes. The line's recipe and size are all that takes.
//
// What the slot's content map entry forbids is not sent: a picture the template keeps (`fit.replace: "keep"`) needs
// `replace_kept`, the customer's own words asking for that picture, and a package holds none.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const NO_BRAND =
  'no brand file in this run, so its colours are not known; the file beside it is a neutral preview and is not written'
const KEPT =
  'the door keeps this picture (fit.replace "keep"): it needs replace_kept with the customer\'s words asking for it, and the package holds none, so the template\'s own stays'
const NEITHER =
  'this frame fits neither way: its slot takes neither HTML nor an image path, and the package says it is a picture'
const REDRAW = 'when the design system changes'

const each = (x) => (Array.isArray(x) ? x : [])

/** The Design system module's two sides, as the slot emits them: role name to colour. */
function moduleSides(html) {
  const sides = {}
  for (const m of html.matchAll(/([^{}]*)\{([^{}]*--ds-c-bg:#[0-9a-fA-F]{6}[^{}]*)\}/g)) {
    const side = /:not\(:has\(> body\.dark-active\)\)/.test(m[1]) ? 'light' : 'dark'
    sides[side] ??= Object.fromEntries(
      [...m[2].matchAll(/--ds-c-([\w-]+):(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2].toLowerCase()])
    )
  }
  return sides
}

/** The colour of each role. The accent is the brand file's; the rest are only in its module, when it has one. */
async function roleColours(brand, brandPath) {
  const file = brand?.colours?.module?.file
  let sides = {}
  if (file) {
    const html = await readFile(path.resolve(path.dirname(brandPath), file), 'utf8').catch(() => '')
    sides = moduleSides(html)
  }
  return {
    accent: brand?.colours?.accent,
    'on-accent': sides.light?.['accent-on'],
    text: sides.light?.fg,
    'on-dark': sides.dark?.fg,
    surface: sides.dark?.surface
  }
}

/** Why this frame is not drawn, or null. */
function gate(item, slot, colours) {
  if (!colours) return { status: 'skipped', reason: NO_BRAND }
  if (slot && slot.type !== 'image') return { status: 'failed', reason: NEITHER }
  if (slot?.fit?.replace === 'keep') return { status: 'skipped', reason: KEPT }
  return null
}

const recipeOf = ({ kind, paint, holds, draw, width, height }) => ({
  kind,
  paint,
  holds,
  draw,
  width,
  height
})

/**
 * @param {{ painted: object[], brand?: object, brandPath?: string, contentMap?: { slots?: object[] } | null,
 *   figures: Map<string, Buffer> }} input `figures`: the package's files by site path
 * @returns {Promise<{ changes: Record<string, string>, files: Map<string, Buffer>, replaced: Set<string>,
 *   recipes: Map<string, object>, left: object[] }>} `changes`: key to drawn file; `files`: what to upload; `replaced`: the
 *   figures a drawn file took the slot of; `recipes`: each drawn frame's report record by key; `left`: the frames that are not
 *   drawn, each with its status, reason and record
 */
export async function preparePainted({ painted, brand, brandPath, contentMap, figures }) {
  const out = { changes: {}, files: new Map(), replaced: new Set(), recipes: new Map(), left: [] }
  const slots = new Map(each(contentMap?.slots).map((s) => [s.key, s]))
  const colours = brand === undefined ? null : await roleColours(brand, brandPath)
  const leave = (item, status, reason) => out.left.push({ item, status, reason, record: recipeOf(item) })
  const open = painted.filter((item) => {
    const stop = gate(item, slots.get(item.key), colours)
    if (stop) leave(item, stop.status, stop.reason)
    return !stop
  })
  if (!open.length) return out
  // Loaded only when there is something to draw: it brings sharp and the icon set.
  const { drawPainted } = await import('./painted-draw.js')
  for (const item of open) {
    const made = await drawPainted(item, colours, { fit: slots.get(item.key)?.fit, figures })
    if (made.problem) {
      leave(item, 'failed', made.problem)
      continue
    }
    const sitePath = `images/tracy-content/${made.sha256}.${made.ext}`
    out.changes[item.key] = sitePath
    out.files.set(sitePath, made.bytes)
    if (item.kind === 'backdrop') out.replaced.add(item.draw.figure)
    out.recipes.set(item.key, {
      ...recipeOf(item),
      width: made.width,
      height: made.height,
      file: sitePath,
      sha256: made.sha256,
      drawnIn: made.drawnIn,
      takes: 'image-path',
      redraw: REDRAW
    })
  }
  return out
}
