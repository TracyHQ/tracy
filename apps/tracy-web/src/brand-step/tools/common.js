// Shared helpers of the brand tools: the usage error, image reading from the run folder, pixel helpers and the
// version suffix that keeps a tool from overwriting a file. Ported from the approved lab's lib.mjs.
import path from 'node:path'
import sharp from 'sharp'
import { contrastHex, hex, parseHexColour } from '../../lib/brand-accent/colour-math.js'
import { sideText } from '../kit-grounds.js'

export { sharp }

/** A usage error the agent should see: the message, and any extra fields the lab tool printed with it. */
export class BrandToolError extends Error {
  constructor(message, extra = {}) {
    super(message)
    this.name = 'BrandToolError'
    this.extra = extra
  }
}

/** Smallest letter height (px at 1x) a name may have in a logo spot; per line when the name is on two lines. */
export const MIN_LETTER_PX = 14
export const COLOURS_FROM =
  'kit site.brandColours.tokens --headings-color (base = opening side, .light-active / .dark-active = other side)'

export const need = (cond, message, extra) => {
  if (!cond) throw new BrandToolError(message, extra)
}

const EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const MEDIA_DIRS = ['', 'media/', 'brief/']

/** The run-folder path an image reference names: the path itself, or a media id with any image extension. */
export function imagePath(files, ref) {
  if (typeof ref !== 'string' || !ref) throw new BrandToolError('image reference missing')
  if (files.has(ref)) return ref
  for (const dir of MEDIA_DIRS)
    for (const ext of EXTS) if (files.has(`${dir}${ref}.${ext}`)) return `${dir}${ref}.${ext}`
  throw new BrandToolError(`image not found: ${ref}`)
}

export const imageBytes = (files, ref) => files.read(imagePath(files, ref))

/** The next free version of a set of files written together: '' for the first run, then '.v2', '.v3', ... */
export function runSuffix(files, firstPath) {
  const ext = path.posix.extname(firstPath)
  const stem = firstPath.slice(0, firstPath.length - ext.length)
  let n = 1
  while (files.has(n === 1 ? firstPath : `${stem}.v${n}${ext}`)) n++
  return n === 1 ? '' : `.v${n}`
}
export const runOf = (suffix) => (suffix ? Number(suffix.slice(2)) : 1)

/** Writes JSON beside the other files of a run. */
export const writeJson = (files, hint, obj) =>
  files.write(hint, Buffer.from(`${JSON.stringify(obj, null, 2)}\n`))

export const readJson = (files, p) => JSON.parse(files.read(p).toString('utf8'))

/** Sidecars `<dir>/<stem>.json`, `<stem>.v2.json`, ... present in the run folder. */
export function sidecarsIn(files, dir, stem) {
  const re = new RegExp(`^${dir}/${stem}(\\.v\\d+)?\\.json$`)
  if (typeof files.list === 'function') return files.list(`${dir}/`).filter((f) => re.test(f))
  const out = []
  for (let n = 1; n <= 30; n++) {
    const f = n === 1 ? `${dir}/${stem}.json` : `${dir}/${stem}.v${n}.json`
    if (files.has(f)) out.push(f)
  }
  return out
}

export const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)

/** RGBA raw pixels of an image. */
export async function raw(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

/** Ground of an image: transparent when most border pixels are transparent, else the median border colour. */
export function groundOf({ data, w, h }) {
  const px = []
  const at = (x, y) => {
    const i = (y * w + x) * 4
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
  }
  for (let x = 0; x < w; x++) px.push(at(x, 0), at(x, h - 1))
  for (let y = 0; y < h; y++) px.push(at(0, y), at(w - 1, y))
  const clear = px.filter((p) => p.a < 16).length / px.length
  if (clear > 0.6) return { transparent: true, colour: null }
  const med = (k) => px.map((p) => p[k]).sort((a, b) => a - b)[px.length >> 1]
  const colour = { r: med('r'), g: med('g'), b: med('b') }
  const spread = px.map((p) => dist(p, colour)).sort((a, b) => a - b)[Math.floor(px.length * 0.9)]
  return { transparent: false, colour, spread }
}

/** Every ground a side's logo can sit on: the kit's logo spot grounds of that side, plus extra. */
export const sideGrounds = (kit, side, extra = []) => [
  ...new Set([
    ...kit.site.logoSpots.filter((s) => s.ground.side === side).map((s) => s.ground.colour.toLowerCase()),
    ...extra.map((x) => x.toLowerCase())
  ])
]

/** Per-side heading colours and the side the template opens on, from the kit. */
export const sideColours = (kit) => ({ ...sideText(kit), from: COLOURS_FROM })

export { contrastHex, hex, parseHexColour }
