/**
 * A picture the engine writes meets its slot's Slot fit: the shape (`fit.aspect`), the width (`fit.minWidth`) and the
 * transparent ground (`fit.transparent`) the Claude Cowork plugin checks before it takes a picture.
 *
 * The plugin refuses a picture whose shape is off its slot's aspect by more than `fit.tolerance` (`SlotFit.php`,
 * `SLOT_IMAGE_INVALID`), narrower than `fit.minWidth` (`SLOT_IMAGE_TOO_SMALL`), or opaque in a slot that shows a cut-out
 * (`SLOT_IMAGE_OPAQUE`), and a refused picture leaves the demo's in its place. Measured on the local stand (29/10/2026, a
 * brief build on a Joomla T4 template): the minWidth is 1.5 times the slot's desktop box, wider than a social post; the
 * aspect is the slot's desktop box, not the demo file (a 1920 x 960 hero file sits in a 1440 x 960 box, aspect 1.5), so a
 * drawing made in the demo file's shape was refused; and an opaque initials placeholder was refused in a transparent slot.
 *
 * So the last step before the upload shapes each picture to its slots the way the browser shows it: cropped to the
 * aspect around its focus (`crop: 'cover'`), or padded with a clear ground (`crop: 'contain'`), enlarged to the widest
 * minWidth, and given clear corners where the slot shows a cut-out. Last, its weight (#189, criterion 9.2): a photo wider
 * than twice its widest box, or heavier than its byte budget, is scaled and re-encoded (`picture-weight.js`). A picture
 * that already fits is untouched, byte for byte.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { weightCapOf } from 'website-opportunities/domain/pictures/picture-acceptance.mjs'
import { shownWidthOf } from 'website-opportunities/domain/fill-plan.mjs'
import { weighed } from '../../lib/picture-weight.js'

const MAX_PIXELS = 100_000_000
const JPEG = { quality: 84, mozjpeg: false }
const PNG = { compressionLevel: 9 }
/** The plugin's own tolerance when the fit names none, or names one over 0.2 (`SlotFit::TOLERANCE`). */
const TOLERANCE = 0.02
/** A corner is clear from this alpha (0..255), as the plugin reads it (`SlotFit::CLEAR_ALPHA`, about 247 opaque). */
const CLEAR_BELOW = 247

/** @param {any} n */
const positive = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null)

/**
 * The aspect the plugin holds a slot to, as `SlotFit::referenceAspect` reads it: none for an unmeasured fit; the demo
 * file's for a contained picture; else `fit.aspect`.
 * @param {any} fit
 */
export function referenceAspectOf(fit) {
  if (fit?.measured !== true) return null
  const crop = fit.crop ?? 'cover'
  if (crop === 'contain' || crop === 'none') {
    const w = positive(fit.source?.width)
    const h = positive(fit.source?.height)
    return w && h ? w / h : null
  }
  return positive(fit.aspect)
}

/**
 * The widest `fit.minWidth` of the slots a group serves, or 0.
 * @param {{slots: Array<{key: string}>}} group
 * @param {Map<string, any>} slotByKey
 */
export function minWidthOf(group, slotByKey) {
  let most = 0
  for (const binding of group?.slots ?? []) {
    const min = slotByKey.get(binding.key)?.fit?.minWidth
    if (Number.isInteger(min) && min > most) most = min
  }
  return most
}

/**
 * What a group's slots ask of one file: the aspect of the slot with the widest minWidth (one file serves every slot, so
 * the largest box decides), its tolerance, crop and focus, and whether any slot shows a cut-out.
 * @param {{slots: Array<{key: string}>}} group
 * @param {Map<string, any>} slotByKey
 */
export function slotFitOf(group, slotByKey) {
  const fits = (group?.slots ?? []).map((b) => slotByKey.get(b.key)?.fit).filter(Boolean)
  const shaped = fits
    .filter((f) => referenceAspectOf(f))
    .sort((a, b) => (positive(b.minWidth) ?? 0) - (positive(a.minWidth) ?? 0))[0]
  const tolerance = positive(shaped?.tolerance)
  return {
    aspect: shaped ? referenceAspectOf(shaped) : null,
    tolerance: tolerance && tolerance <= 0.2 ? tolerance : TOLERANCE,
    crop: shaped?.crop ?? 'cover',
    focus: shaped?.focus ?? null,
    minWidth: minWidthOf(group, slotByKey),
    transparent: fits.some((f) => f.transparent === true)
  }
}

/** sharp's crop position for a fit's focus. @param {string|null} focus */
const positionOf = (focus) =>
  focus === 'top'
    ? 'north'
    : focus === 'bottom'
      ? 'south'
      : focus === 'left'
        ? 'west'
        : focus === 'right'
          ? 'east'
          : sharp.strategy.attention

/** Whether every corner is opaque, the way the plugin reads a transparent ground. @param {Buffer} bytes */
async function opaqueCorners(bytes) {
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'none' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const at = (/** @type {number} */ x, /** @type {number} */ y) =>
    data[(y * info.width + x) * info.channels + 3]
  const w = info.width - 1
  const h = info.height - 1
  return [at(0, 0), at(w, 0), at(0, h), at(w, h)].every((a) => a >= CLEAR_BELOW)
}

/**
 * Shape each picture to what its slots ask, keeping its format, or PNG where the slot needs a clear ground.
 * @template {{group: {slots: Array<{key: string}>}, bytes: Buffer, ext: string, hash: string, receipt?: any}} T
 * @param {T[]} shaped
 * @param {{slots?: any[]}} contentMap
 * @returns {Promise<T[]>}
 */
export async function meetSlotFit(shaped, contentMap) {
  const slotByKey = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  const out = []
  for (const item of shaped) {
    const fit = slotFitOf(item.group, slotByKey)
    const shown = Math.max(
      0,
      ...(item.group?.slots ?? []).map((b) => Number(shownWidthOf(slotByKey.get(b.key))) || 0)
    )
    try {
      const open = (/** @type {Buffer} */ b) => sharp(b, { limitInputPixels: MAX_PIXELS, failOn: 'none' })
      const meta = await open(item.bytes).metadata()
      if (!meta.width || !meta.height) {
        out.push(item)
        continue
      }
      let bytes = item.bytes
      let { width, height } = meta
      let ext = item.ext
      const changed = []
      // 1. The shape: off the aspect by more than the tolerance is cropped (cover) or padded clear (contain).
      if (fit.aspect && Math.abs(width / height / fit.aspect - 1) > fit.tolerance) {
        const wider = width / height > fit.aspect
        const w = wider ? Math.round(height * fit.aspect) : width
        const h = wider ? height : Math.round(width / fit.aspect)
        if (fit.crop === 'contain' || fit.crop === 'none') {
          const W = wider ? width : Math.round(height * fit.aspect)
          const H = wider ? Math.round(width / fit.aspect) : height
          bytes = await open(bytes)
            .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png(PNG)
            .toBuffer()
          ext = 'png'
          ;[width, height] = [W, H]
        } else {
          bytes = await open(bytes)
            .resize(w, h, { fit: 'cover', position: positionOf(fit.focus) })
            .toFormat(ext === 'png' ? 'png' : 'jpeg', ext === 'png' ? PNG : JPEG)
            .toBuffer()
          ;[width, height] = [w, h]
        }
        changed.push('aspect')
      }
      // 2. The width: narrower than the widest minWidth is enlarged to it, keeping its shape.
      if (fit.minWidth && width < fit.minWidth) {
        const h = Math.round((height * fit.minWidth) / width)
        bytes = await open(bytes)
          .resize(fit.minWidth, h, { fit: 'fill', kernel: 'lanczos3' })
          .toFormat(ext === 'png' ? 'png' : 'jpeg', ext === 'png' ? PNG : JPEG)
          .toBuffer()
        ;[width, height] = [fit.minWidth, h]
        changed.push('width')
      }
      // 3. The ground: an opaque picture in a slot that shows a cut-out gets round, clear corners (a pill or a disc).
      if (fit.transparent && (await opaqueCorners(bytes))) {
        const r = Math.floor(Math.min(width, height) / 2)
        const mask = Buffer.from(
          `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${r}" ry="${r}"/></svg>`
        )
        bytes = await open(bytes)
          .ensureAlpha()
          .composite([{ input: mask, blend: 'dest-in' }])
          .png(PNG)
          .toBuffer()
        ext = 'png'
        changed.push('ground')
      }
      // 4. The weight: never several times the size it is shown at, never past its byte budget.
      const weight = await weighed(bytes, {
        ext,
        maxWidth: weightCapOf({ shown: shown || null, minWidth: fit.minWidth || null })
      })
      if (weight.changed) {
        bytes = weight.bytes
        ;[width, height] = [weight.width, weight.height]
        changed.push('weight')
      }
      if (changed.length === 0) {
        out.push(item)
        continue
      }
      const hash = createHash('sha256').update(bytes).digest('hex')
      out.push({
        ...item,
        bytes,
        ext,
        hash,
        ...(item.receipt
          ? {
              receipt: {
                ...item.receipt,
                width,
                height,
                fittedFrom: { width: meta.width, height: meta.height, changed }
              }
            }
          : {})
      })
    } catch {
      // An unreadable picture goes as it is: the site says why it refuses it, as before.
      out.push(item)
    }
  }
  return out
}
