// Step 1 of the picture policy (ticket #595, spec #577): the own pictures, wherever they fit a frame. Pure.
//
//   - a frame of an item, or of the named person it shows, takes that item's or person's own photo, an unused one
//     first; a used one shows again only in a frame of the same shape class on another page (`picture-reuse.mjs`);
//   - a video frame takes a fitting own video;
//   - the hero and the other block and row frames take a free gallery photo, one the plan shows nowhere else, the hero
//     first and by fit. A gallery photo is used once. A frame of a gallery kind (`gallery_own_photos_only`) takes one
//     too: that reason only refuses a drawn picture.
import { fitsFrame, heroFit } from './picture-fit.mjs'
import { videoFits } from './picture-policy-check.mjs'
import { GALLERY_ONLY_OWN } from './picture-roles.mjs'
import { mayReuse } from './picture-reuse.mjs'

const heroFirst = (a, b) => (a.place === 'hero' ? 0 : 1) - (b.place === 'hero' ? 0 : 1)
const FREE_PLACES = new Set(['hero', 'block', 'row'])

/** What an own picture adds to its frame: the picture, its label and where it came from. */
export const ownDecisionOf = (picture) => ({
  source: 'own',
  picture: picture.id,
  ref: picture.ref,
  label: picture.label,
  from: Array.isArray(picture.from) ? picture.from : []
})

/**
 * Fill the frames own pictures fit.
 * @param {object[]} frames the frames of the plan, variants left out
 * @param {object[]} usable the labelled own pictures, stock ones left out
 * @param {(frame: object, picture: object) => void} take records a picture in a frame
 */
export function placeOwn(frames, usable, take) {
  const used = new Set()
  const uses = new Map()
  const put = (frame, picture) => {
    used.add(picture.id)
    uses.set(picture.id, [...(uses.get(picture.id) ?? []), frame])
    take(frame, picture)
  }
  const free = (p) => !used.has(p.id)
  const owned = frames.filter(
    (f) => (f.place === 'item' || f.person) && f.never !== 'logo_from_brand_step' && f.place !== 'video'
  )
  for (const frame of owned) {
    const owner = frame.person ?? frame.item
    const mine = usable.filter(
      (p) =>
        p.item === owner &&
        fitsFrame(p, frame) &&
        (free(p) || (p.itemKind !== 'gallery' && mayReuse(uses.get(p.id), frame)))
    )
    // An unused photo of the item first, the item's own picture first among them; then one shown before.
    const unused = mine.filter(free)
    const picture = unused.find((p) => p.id === owner) ?? unused[0] ?? mine[0]
    if (picture) put(frame, picture)
  }
  for (const frame of frames.filter((f) => f.place === 'video')) {
    const videos = usable.filter((p) => videoFits(p) && free(p))
    const video = videos.find((p) => frame.item && p.item === frame.item) ?? videos[0]
    if (video) put(frame, video)
  }
  const shownItems = new Set(frames.map((f) => f.item).filter(Boolean))
  const gallery = usable.filter((p) => p.itemKind === 'gallery' && !shownItems.has(p.item))
  const freeFrames = frames
    .filter((f) => FREE_PLACES.has(f.place) && !f.person && (!f.never || f.never === GALLERY_ONLY_OWN))
    .sort(heroFirst)
  for (const frame of freeFrames) {
    const fits = gallery.filter((p) => free(p) && fitsFrame(p, frame))
    if (frame.place === 'hero') fits.sort((a, b) => heroFit(b) - heroFit(a))
    if (fits[0]) put(frame, fits[0])
  }
}
