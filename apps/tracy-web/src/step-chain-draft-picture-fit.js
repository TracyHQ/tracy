// A picture fitted to the frame its contract slot declares before it is uploaded (#597, gate run 7): the plugin refuses
// an image slot any other shape (`SLOT_IMAGE_INVALID`) or, where the slot asks for a clear ground, an opaque corner
// (`SLOT_IMAGE_OPAQUE`), and a square logo in the footer logo slot (393 x 113, transparent) stopped the whole write.
// The plan names the frame on the upload op (`slotFit`, `draft-write-picture-fits.mjs`).
//
//   fit       the picture padded with transparency, centred, to the frame's aspect (`prepareBrand`, the brand path's
//             own padding): nothing is cut, so a logo is never cropped; enlarged only to reach the frame's
//             minimum width, and at most `FIT_UPSCALE_LIMIT` times
//   cannot    too small to reach the minimum width within the limit (`slot_picture_too_small`), an opaque corner left
//             where the slot needs a clear ground (`slot_picture_opaque`), or one picture sent to slots of two shapes
//             (`slot_picture_shapes_differ`)
//   then      an optional place (its block declares a hide or a fallback for no data) is left out: the picture is
//             not uploaded, its slots are not written (`state.left`, kept in the run record), the report lists it
//             (`placesLeft`, `slot_picture_left_out`) and the rest
//             of the write goes on; a required place stops the write, typed and named (`slot_picture_unfit`)
//   unread    bytes sharp cannot read are uploaded as they are and flagged (`slot_picture_unread`)
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import sharp from 'sharp'
import { prepareBrand } from './sites/brief-engines/brand-images.js'

/** The most a picture is enlarged to reach a slot's minimum width: past it the picture would read blurred. */
export const FIT_UPSCALE_LIMIT = 2

/** The alpha of a picture's four corners. */
async function cornersOf(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (x, y) => data[(y * info.width + x) * info.channels + info.channels - 1]
  const [w, h] = [info.width - 1, info.height - 1]
  return [at(0, 0), at(w, 0), at(0, h), at(w, h)]
}

/**
 * The picture in the slot's frame: `{bytes, mime}`, `{problem}` when it cannot be, `{unread: true}` for bytes sharp
 * cannot read.
 * @param {{bytes: Uint8Array}} stored @param {{width: number, height: number, minWidth: number, transparent: boolean}} fit
 */
export async function fittedPicture(stored, fit) {
  try {
    await sharp(stored.bytes).metadata()
  } catch {
    return { unread: true }
  }
  let bytes = (await prepareBrand({ logo: { single: stored.bytes } }, { frame: fit })).logo.single
  const { width } = await sharp(bytes).metadata()
  if (width < fit.minWidth) {
    if (fit.minWidth / width > FIT_UPSCALE_LIMIT) return { problem: 'slot_picture_too_small' }
    bytes = await sharp(bytes).resize({ width: fit.minWidth }).png().toBuffer()
  }
  if (fit.transparent && (await cornersOf(bytes)).some((a) => a !== 0))
    return { problem: 'slot_picture_opaque' }
  return { bytes, mime: 'image/png' }
}

/**
 * The bytes a picture upload sends: the stored ones, fitted to the slot's frame when the op names one. Null when the
 * place is left out (optional, the picture cannot be fitted); a required place that cannot be fitted throws.
 */
export async function slotPictureOf(op, stored, ctx) {
  if (!op.slotFit) return stored
  const got = op.slotFitConflict
    ? { problem: 'slot_picture_shapes_differ' }
    : await fittedPicture(stored, op.slotFit)
  if (got.unread) {
    ctx.report.unproven.push({ code: 'slot_picture_unread', op: op.key })
    return stored
  }
  if (!got.problem) return got
  const place = { op: op.key, picture: op.picture, slots: op.slotFit.slots, problem: got.problem }
  if (!op.slotOptional)
    throw new DraftWriteError('slot_picture_unfit', `${op.key} cannot take the frame of its slots`, place, {
      noRerun: true
    })
  ctx.state.left ??= {}
  ctx.state.left[`picture:${op.picture}`] = got.problem
  return null
}
