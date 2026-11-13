// Whether an own picture fits a frame, and which items an image block drops (ticket #595, spec #577). Pure helpers of
// the picture policy (`picture-policy.mjs`): the same content and shape check holds for every frame, the hero, block,
// item and gallery frames alike, so a label that arrives after the plan was counted (a photo the vision call reads as a
// text graphic, or as portrait) keeps it out of a frame it does not fit.
//
// 🔒 A PHOTO IS NEVER ENLARGED INTO A FRAME. A frame that declares its size (Contract A `frame`) takes a measured photo
// only when the largest crop of the frame's shape is at least the frame's width, within the rounding tolerance of
// `pictures/enlarge-limit.mjs`: the photo is cut down, never blown up (the locked planner rule "never enlarged"). An
// unmeasured photo, or a frame without a declared size, is not judged.
//
// 🔒 ONLY A GALLERY SHOWS FEWER ITEMS. A service, a package, a person or any other item the plan lists is never dropped
// for want of a photo: its frame is drawn within the cap, or left empty (a person shows their initials). Only a gallery,
// which shows the business's own photos and nothing else, shows fewer rows when its photos run out.
import { LOGO_FRAME_ROLES } from './picture-roles.mjs'
import { heroScore, NOT_A_HERO, orientationOf, resolutionGradeOf } from './pictures/asset-labels.mjs'
import { enlargedPast } from './pictures/enlarge-limit.mjs'
import { cropBox } from './pictures/placement.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const LOGO_FRAMES = new Set(LOGO_FRAME_ROLES)
const OPPOSITE = Object.freeze({ landscape: 'portrait', portrait: 'landscape' })

/** A picture's shape: its labelled orientation, else the one its pixel size gives. */
export const orientation = (p) =>
  p.orientation && p.orientation !== 'unknown' ? p.orientation : orientationOf(p.width, p.height)

/** Whether a measured photo is too small for a sized frame: its largest crop of the frame's shape is narrower. */
function tooSmall(picture, frame) {
  const { width, height } = frame.size ?? {}
  if (!width || !height || !(picture.width > 0) || !(picture.height > 0)) return false
  const box = cropBox(picture.width, picture.height, width / height)
  return enlargedPast(width, box.width)
}

/**
 * Why a photo does not fit a frame, or null when it fits. A frame takes a photograph (never a video); a logo or a text
 * graphic only in a logo frame; never a portrait photo in the hero; never a photo of the opposite shape (a landscape
 * frame never takes a portrait photo, nor back; a square or undeclared frame takes either); never a photo smaller than
 * the frame's declared size.
 * @returns {null | 'not_a_photo' | 'not_a_picture_for_this_frame' | 'shape_unfit' | 'too_small'}
 */
export function unfitReason(picture, frame) {
  if (picture.media !== 'photo') return 'not_a_photo'
  if (!LOGO_FRAMES.has(frame.kind) && NOT_A_HERO.has(picture.content)) return 'not_a_picture_for_this_frame'
  const shape = orientation(picture)
  if (frame.place === 'hero' && shape === 'portrait') return 'shape_unfit'
  if (OPPOSITE[frame.shape] === shape) return 'shape_unfit'
  if (tooSmall(picture, frame)) return 'too_small'
  return null
}

/** Whether a photo fits a frame by content and shape. */
export const fitsFrame = (picture, frame) => unfitReason(picture, frame) === null

/** How well a photo fits the hero, by the shared hero score of its labels. */
export const heroFit = (p) =>
  heroScore({
    orientation: orientation(p),
    quality: p.quality ?? resolutionGradeOf(p.width, p.height),
    content: p.content
  })

/** Why an item has no own photo in its frame: only stock pictures, own photos that do not fit, or none at all. */
function bareReason(item, pictures) {
  const mine = pictures.filter((p) => p.item === item && p.media === 'photo')
  if (mine.length === 0) return 'no_own_photo'
  if (mine.every((p) => p.stock)) return 'stock_only'
  return 'own_photo_unfit'
}

/**
 * Gallery items dropped: per block, the gallery items whose picture frame stays empty, while the block keeps more than
 * its minimum. Every other item stays (see the head of the file). Each says why it has no picture (`bareReason`).
 * @param {object[]} pictures every own picture record, stock ones too, so the reason is the true one
 */
export function reductionsOf(frames, filled, pages, blocks, pictures) {
  const reduced = []
  for (const page of list(pages))
    for (const block of list(page.blocks)) {
      const mine = frames.filter(
        (f) => f.block === block.id && f.page === page.id && f.place === 'item' && f.itemKind === 'gallery'
      )
      const shown = [...new Set(mine.map((f) => f.item))]
      const bare = shown.filter((item) => mine.some((f) => f.item === item && !f.people && !filled.has(f.id)))
      const min = Math.max(1, Number(blocks.get(block.block)?.items?.min ?? 1))
      let count = shown.length
      for (const item of bare.reverse()) {
        if (count <= min) break
        count -= 1
        reduced.push({ page: page.id, block: block.id, item, reason: bareReason(item, list(pictures)) })
      }
    }
  return reduced
}
