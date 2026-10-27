/**
 * Slot fit on the agent demo path (wave 1): a collected photo takes a template picture's place only in that place's own
 * shape, and never takes the place of a picture the template keeps.
 *
 * The agent chooses which photo goes where; the shared picture planner (`website-opportunities` `pictures/`) decides
 * whether it can go there at all and how it is cut: `shapeFit` / `fitCrop` are the planner's own limits and crop
 * (never more than half the photo cut away, never enlarged past its limit, the frame's shape to the pixel), and
 * `protectedPicture` its list of pictures no path replaces (a slot kept with `customize: "keep"`, an icon, an avatar, a
 * signature, a logo, a cut-out, a drawing). A frame no photo fits keeps the template's picture.
 *
 * 🔒 THE FRAME IS THE BOX THE TEMPLATE DRAWS (Slot fit, 27/10/2026): a built sports club placed phone portraits whole into
 * wide class cards, square trainer cards and icon slots, and every box grew with its photo (sections up to 133% taller).
 * The shape is read from the QA baseline's measured boxes (`imageFrames`) before the size the contract declares.
 */
import { declaredSize, fileOf, protectedPicture } from 'website-opportunities/domain/pictures/slot-map.mjs'
import { fitCrop, shapeFit } from 'website-opportunities/domain/pictures/placement.mjs'
import { aspectOf } from './agent-demo-image.js'

/** How far a recipe's shape may be from its frame's, relative (a sealed site refuses past 0.02). */
const SHAPE_TOLERANCE = 0.02
const IMAGE_FILE = /\.(?:jpe?g|png|webp|gif|avif|svg)(?:[?#]|$)/i

/** A demo file as a path to compare: no fragment, no query, no leading slash. */
export const plainFile = (value) => fileOf(value).split('?')[0]

const sameFile = (a, b) => Boolean(a && b) && (a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`))
const pageKey = (p) =>
  String(p ?? '/')
    .split(/[?#]/)[0]
    .replace(/^\/index\.php(?=\/|$)/, '')
    .replace(/(.)\/+$/, '$1') || '/'

/** The picture file a slot or field holds now (its contract `current`, else its `sample`), or null when it holds none. */
export function slotFile(slot) {
  for (const value of [slot?.current, slot?.sample])
    if (typeof value === 'string' && IMAGE_FILE.test(value)) return plainFile(value)
  return null
}

/**
 * The frame a template picture is drawn in: the box the baseline measured for that file (on `page` first), else the size
 * the contract declares for it. Null when neither is known.
 * @param {{slot?: any, file?: string | null, page?: string}} place
 * @param {{imageFrames?: Array<{path: string, width: number, height: number, route?: string}>} | null} [baseline]
 * @returns {{file: string, width: number, height: number, from: 'rendered' | 'declared'} | null}
 */
export function pictureFrame({ slot = null, file = slotFile(slot), page } = {}, baseline = null) {
  if (!file) return null
  const boxes = (baseline?.imageFrames ?? []).filter(
    (f) => f.width >= 16 && f.height >= 16 && sameFile(plainFile(f.path), file)
  )
  const box =
    (page !== undefined && boxes.find((f) => pageKey(f.route) === pageKey(page))) || boxes[0] || null
  if (box) return { file, width: box.width, height: box.height, from: 'rendered' }
  const declared = declaredSize(slot?.current) ?? declaredSize(slot?.sample)
  return declared ? { file, ...declared, from: 'declared' } : null
}

/** Why a template picture stays as it is, or null: the planner's rule, read with what is known of the file. */
export function protectedOf(slot, file, frame = null) {
  if (!file) return null
  const declared = declaredSize(slot?.current) ?? declaredSize(slot?.sample)
  const size = declared ?? (frame ? { width: frame.width, height: frame.height } : null)
  return protectedPicture(slot ?? {}, file, size)
}

/**
 * What is wrong with a `replace-image` row aimed at a template picture, as messages for the plan's issues (empty: none).
 * @param {any} row - the plan row
 * @param {{slot?: any, file?: string | null, frame?: ReturnType<typeof pictureFrame>, logoIds?: Set<string>,
 *   sizes?: Map<string, {width: number, height: number}>}} place
 */
export function framePictureIssues(
  row,
  { slot = null, file = null, frame = null, logoIds = new Set(), sizes = new Map() }
) {
  const issues = []
  const guard = protectedOf(slot, file, frame)
  const onlyLogo = row.assetIds.length > 0 && row.assetIds.every((id) => logoIds.has(id))
  if (guard && !(guard.kind === 'logo' && onlyLogo)) {
    issues.push(
      `This picture is ${guard.reason}; no collected photo replaces it. Keep it with operation retain and put the photo in a photo frame.`
    )
    return issues
  }
  if (!frame || guard?.kind === 'logo') return issues
  const aspect = frame.width / frame.height
  const shape = `${frame.width}×${frame.height} (width / height ${aspect.toFixed(4)})`
  const asked = aspectOf(row.image?.crop?.aspect)
  if (Number.isFinite(asked) && asked > 0 && Math.abs(asked / aspect - 1) > SHAPE_TOLERANCE)
    issues.push(
      `This frame is ${shape}: image.crop.aspect ${asked.toFixed(4)} would change its shape. Write the frame's aspect, or leave image out and the import cuts the photo to the frame.`
    )
  const known = row.assetIds.filter((id) => sizes.has(id))
  if (known.length === row.assetIds.length && known.length > 0) {
    const fits = (id) => shapeFit(sizes.get(id), frame) !== null
    if (!known.some(fits)) {
      const others = [...sizes.keys()].filter((id) => !logoIds.has(id) && fits(id)).slice(0, 12)
      issues.push(
        `No photo of this row can be cut to this frame, ${shape}, without cutting away more than half of it or enlarging it: keep the template's picture (operation retain)${others.length ? `, or use a photo that fits: ${others.join(', ')}` : ''}.`
      )
    }
  }
  return issues
}

/**
 * The image recipe an import cuts a photo of `size` by to fill `frame`, or null when the planner says it does not fit.
 * @param {{width: number, height: number}} frame @param {{width: number, height: number}} size @param {string} assetId
 */
export function frameRecipe(frame, size, assetId) {
  const crop = fitCrop(size, frame)
  return crop ? { assetId, crop } : null
}

/**
 * The template pictures of a frozen contract that no build path replaces, each with why: what the QA lets stay and
 * checks is still there.
 * @param {any} structure - the build's frozen structure (`content.agentDemo.structure`)
 * @param {any} [baseline] - the QA baseline, for the measured frames
 * @returns {Array<{file: string, kind: string, reason: string}>}
 */
export function keptPictures(structure, baseline = null) {
  const kept = new Map()
  const slots = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node.slots)) slots.push(...node.slots.filter((s) => s && typeof s === 'object'))
    else if (node.slots && typeof node.slots === 'object')
      for (const [key, value] of Object.entries(node.slots))
        slots.push(value && typeof value === 'object' ? { key, ...value } : { key, current: value })
    for (const value of Object.values(node))
      if (value && typeof value === 'object' && value !== node.slots) walk(value)
  }
  walk(structure?.contract)
  for (const slot of slots) {
    const file = slotFile(slot)
    if (!file || kept.has(file) || /^https?:/i.test(file)) continue
    const guard = protectedOf(slot, file, pictureFrame({ slot, file }, baseline))
    // A logo is the business's to take (its header's and footer's); every other kind stays the template's.
    if (guard && guard.kind !== 'logo') kept.set(file, { file, kind: guard.kind, reason: guard.reason })
  }
  return [...kept.values()]
}
