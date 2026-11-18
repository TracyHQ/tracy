// The painted frames of a picture package (ADR 0043 section 1a, ADR 0044 decision 4): initials tiles, icons and the backdrop
// behind a cut-out figure carry colour roles, not colours, and the write step resolves the roles from the brand file.
//
// A frame that takes HTML would use the Design system's accent variable. None does on the door there is: a contract slot
// refuses `<` and `>` (`SLOT_NOT_CONTENT`), and an image slot takes a png, jpg or webp path that is on the site, so an SVG
// is refused too. So each frame here is a drawn file, written like any other picture, and its report line says it is
// drawn again when the Design system changes. The line's recipe and size are all that takes.
//
// What the slot's content map entry forbids is not sent: a picture the template keeps (`fit.replace: "keep"`) needs
// `replace_kept`, the customer's own words asking for that picture, and a package holds none. A kept icon goes when the plugin
// on the site says it takes a transparent drawing there (`info.slot_corrections`, slot-corrections.js); it refuses anything
// opaque itself. `replace_kept` is never written for it: no customer said those words.
//
// An icon may be replaced; its look may not change (#380). A recipe's size, weight and plate were decided by the picture step,
// which can run without the template's files (`plate: null`, "no demo icon to measure"), so the template's own icon is read here,
// from the site, and what it shows decides them. The file named by the slot stays on the site, so a second run reads the same
// bytes, draws the same file and writes nothing. An icon whose template icon cannot be read is not drawn: the template's own stays.
// What is drawn is then held to that same file (painted-look-guard.js), and a drawing that moved from it is refused, not written.
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'node:path'
import { isKeptIcon } from './slot-corrections.js'

const NO_BRAND =
  'no brand file in this run, so its colours are not known; the file beside it is a neutral preview and is not written'
const KEPT =
  'the door keeps this picture (fit.replace "keep"): it needs replace_kept with the customer\'s words asking for it, and the package holds none, so the template\'s own stays'
const NEITHER =
  'this frame fits neither way: its slot takes neither HTML nor an image path, and the package says it is a picture'
const REDRAW = 'when the design system changes'
const TEMPLATE_UNREAD = (file) =>
  `the template's icon ${file} could not be read, so what it looks like is not known; the template's own stays`
const NO_READER = (file) =>
  `This icon replaces the template icon ${file}, and no reader of the site's files was given, so it cannot be held to that icon's look.`
const TEMPLATE_FILE = /^(?!.*\.\.)[\w./-]+\.(?:png|webp|jpe?g|gif|svg)$/i

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

/** Accent-only brands keep the template's neutral backdrop. Read its actual picture, never a preview palette. */
async function backdropColours(item, colours, slot, templateFile, templateAccent) {
  if (item.kind !== 'backdrop' || colours.surface || item.paint?.circle !== 'surface' || !templateFile)
    return { colours }
  const file = templateFileOf(slot)
  if (!file) return { colours }
  const bytes = await templateFile(file).catch(() => null)
  if (!bytes) return { colours }
  const { backdropOf } = await import('../lib/picture-paint/cutout-backdrop.js')
  const measured = await backdropOf(bytes, { accent: templateAccent })
  // A changed template picture cannot supply a neutral for an old recipe. Keep the existing explicit failure.
  if (
    !measured ||
    measured.paint.circle !== 'surface' ||
    !isDeepStrictEqual(measured.shape, item.draw?.backdrop)
  )
    return { colours }
  return {
    colours: { ...colours, surface: measured.demoColours.circle },
    source: { file, role: 'surface', colour: measured.demoColours.circle }
  }
}

/**
 * The frames the stage leaves without a picture of their own: not drawn, not a kept picture the template holds on purpose, not an
 * icon (the template's icon is its look, not demo content), and with nothing else sent for them. The write step's closing rule
 * (closing-ladder.js) empties each, so a frame no brand colour could paint never keeps the template's demo picture.
 * @param {object[]} left `out.left` of preparePainted
 * @param {Record<string, string>} changes what the picture stage sends, by content map key
 * @returns {{ slot: string, key: string, reason: string }[]}
 */
export function undrawnFrames(left, changes) {
  return left
    .filter(({ item, reason }) => item.kind !== 'icon' && item.kind !== 'backdrop' && reason !== KEPT)
    .filter(({ item }) => typeof item.key === 'string' && !(item.key in changes))
    .map(({ item, reason }) => ({ slot: item.frame, key: item.key, reason }))
}

/** Why this frame is not drawn, or null. */
function gate(item, slot, colours, takesIcons) {
  if (!colours) return { status: 'skipped', reason: NO_BRAND }
  if (slot && slot.type !== 'image') return { status: 'failed', reason: NEITHER }
  if (slot?.fit?.replace !== 'keep') return null
  return takesIcons && item.kind === 'icon' && isKeptIcon(slot) ? null : { status: 'skipped', reason: KEPT }
}

const recipeOf = ({ kind, paint, holds, draw, width, height }) => ({
  kind,
  paint,
  holds,
  draw,
  width,
  height
})

/** The site path of the template icon a slot holds, or null when it holds none. */
function templateFileOf(slot) {
  const file = String(slot?.sample ?? '')
    .split('#')[0]
    .replace(/^\/+/, '')
  return TEMPLATE_FILE.test(file) ? file : null
}

/**
 * Each open icon's template look. A file is read once, however many frames show it.
 * @returns {Promise<{ looks: Map<string, { file: string | null, look: object | null }>, unread: Map<string, string> }>} by frame
 */
async function readTemplateLooks(icons, slots, templateFile) {
  const { iconLookOf, sectionLooks } = await import('../lib/picture-paint/icons/template-icon-look.js')
  const ofFile = new Map()
  const unread = new Map()
  const found = new Map()
  for (const item of icons) {
    const file = templateFileOf(slots.get(item.key))
    if (!file) continue
    if (!ofFile.has(file)) {
      const bytes = await templateFile(file).catch(() => null)
      ofFile.set(file, bytes ? await iconLookOf(bytes) : null)
    }
    if (ofFile.get(file)) found.set(item.frame, ofFile.get(file))
    else unread.set(item.frame, file)
  }
  const whole = sectionLooks(found)
  const looks = new Map(
    icons
      .filter((item) => !unread.has(item.frame))
      .map((item) => [
        item.frame,
        { file: templateFileOf(slots.get(item.key)), look: whole.get(item.frame) ?? null }
      ])
  )
  return { looks, unread }
}

/**
 * @param {{ painted: object[], brand?: object, brandPath?: string, contentMap?: { slots?: object[] } | null,
 *   figures: Map<string, Buffer>, corrections?: () => Promise<{ icons: boolean }>,
 *   templateFile?: (file: string) => Promise<Buffer | null>, templateAccent?: string | null }} input `figures`: the package's
 *   files by site path; `corrections`: what the plugin on the site takes, asked only when a kept icon needs the answer;
 *   `templateFile`: reads a file of the site; without it an icon that replaces a template's own is refused;
 *   `templateAccent`: the accent the template's icons were drawn in; `draw`: draws a frame (`drawPainted`)
 * @returns {Promise<{ changes: Record<string, string>, files: Map<string, Buffer>, replaced: Set<string>,
 *   recipes: Map<string, object>, left: object[], refused: object[] }>} `refused`: what the look guard refuses, before anything is
 *   sent; `changes`: key to drawn file; `files`: what to upload; `replaced`: the
 *   figures a drawn file took the slot of; `recipes`: each drawn frame's report record by key; `left`: the frames that are not
 *   drawn, each with its status, reason and record
 */
export async function preparePainted({
  painted,
  brand,
  brandPath,
  contentMap,
  figures,
  corrections,
  templateFile,
  templateAccent = null,
  draw
}) {
  const out = {
    changes: {},
    files: new Map(),
    replaced: new Set(),
    recipes: new Map(),
    left: [],
    refused: []
  }
  const slots = new Map(each(contentMap?.slots).map((s) => [s.key, s]))
  const colours = brand === undefined ? null : await roleColours(brand, brandPath)
  const leave = (item, status, reason) => out.left.push({ item, status, reason, record: recipeOf(item) })
  const asksForIcon = painted.some((item) => item.kind === 'icon' && isKeptIcon(slots.get(item.key)))
  const takesIcons = colours && asksForIcon && corrections ? (await corrections()).icons : false
  const open = painted.filter((item) => {
    const stop = gate(item, slots.get(item.key), colours, takesIcons)
    if (stop) leave(item, stop.status, stop.reason)
    return !stop
  })
  if (!open.length) return out
  // Loaded only when there is something to draw: it brings sharp and the icon set.
  const drawPainted = draw ?? (await import('./painted-draw.js')).drawPainted
  const { iconGuard, PICTURE_STEP } = await import('./painted-look-guard.js')
  const guard = iconGuard()
  const template = templateFile
    ? await readTemplateLooks(
        open.filter((item) => item.kind === 'icon'),
        slots,
        templateFile
      )
    : { looks: new Map(), unread: new Map() }
  for (const item of open) {
    if (template.unread.has(item.frame)) {
      leave(item, 'failed', TEMPLATE_UNREAD(template.unread.get(item.frame)))
      continue
    }
    const held = template.looks.get(item.frame)
    const unreadable = !templateFile && item.kind === 'icon' ? templateFileOf(slots.get(item.key)) : null
    if (unreadable) {
      out.refused.push({ step: PICTURE_STEP, what: item.frame, reason: NO_READER(unreadable) })
      continue
    }
    const palette = await backdropColours(item, colours, slots.get(item.key), templateFile, templateAccent)
    const made = await drawPainted(item, palette.colours, {
      fit: slots.get(item.key)?.fit,
      figures,
      look: held?.look ?? null,
      templateAccent
    })
    if (made.problem) {
      leave(item, 'failed', made.problem)
      continue
    }
    if (item.kind === 'icon' && held?.look) await guard.judge(item, made, held.look)
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
      ...(palette.source ? { templateColour: palette.source } : {}),
      ...(held ? { template: held.look ? { file: held.file, look: held.look } : null } : {}),
      takes: 'image-path',
      redraw: REDRAW
    })
  }
  out.refused.push(...guard.refused())
  return out
}
