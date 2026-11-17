// An owner photo cut to the frame its contract slot declares (#575 pictures gap audit, port 3), with the step chain's
// own cutter (`site-pictures/cut-photo.js` `cutPhoto`, ADR 0043 section 3): the largest box of the slot's shape around
// the photo's labelled subject, never through a head, written at exactly the slot's demo file aspect, enlarged at most
// `MAX_ENLARGE` (1.5) times and only through the sharpness gate, as a JPEG at quality 84. The labels are the research's
// (`picture-research-labels.mjs`: subject box, face boxes, quality), by the picture's address; a photo without them is
// cut where sharp's attention strategy puts the crop, heads kept whole by the unlabelled head band (`head-boxes.js`).
//
// Only the frame comes from elsewhere: the step chain read it from the demo site, the build chat from the slot's
// declared `fit` (the blank site contract): its source size is the demo file, its `minWidth` the narrowest file.
import { LOGO_FRAME_ROLES } from 'website-opportunities/domain/picture-roles.mjs'
import { cutPhoto } from './site-pictures/cut-photo.js'

const LOGOS = new Set(LOGO_FRAME_ROLES)
/** The cutter's refusals that mean the photo is too small for the slot, said as the fit's own code. */
const TOO_SMALL = new Set([
  'too-small',
  'too-small-after-crop',
  'narrower-than-min-width',
  'low-quality-in-a-large-frame'
])

/** Whether an upload is an owner photo the cutter takes: not a logo, not a slot that needs a clear ground. */
export const isCutPhoto = (op) =>
  !op.slotFit?.transparent && !LOGOS.has(op.pictureKind) && !op.draw && op.pictureKind !== undefined

/**
 * The photo cut for its slot: `{bytes, mime}`, or `{problem}` with the fit's code (`slot_picture_too_small`, or
 * `slot_photo_<cutter refusal>`).
 * @param {{bytes: Uint8Array}} stored
 * @param {{width: number, height: number, minWidth?: number}} fit the op's `slotFit`
 * @param {object} [labels] the research labels of the photo
 */
export async function cutSlotPhoto(stored, fit, labels = {}) {
  const minWidth = Number.isInteger(fit.minWidth) && fit.minWidth > 0 ? fit.minWidth : undefined
  const frame = { width: fit.width, height: fit.height, ...(minWidth ? { minWidth } : {}) }
  const cut = await cutPhoto(stored.bytes, labels ?? {}, frame, { width: fit.width, height: fit.height })
  if (cut.ok) return { bytes: cut.bytes, mime: 'image/jpeg' }
  if (cut.refused === 'unreadable') return { unread: true }
  return {
    problem: TOO_SMALL.has(cut.refused)
      ? 'slot_picture_too_small'
      : `slot_photo_${cut.refused.replace(/-/g, '_')}`
  }
}
