// The picture policy of an AI quickstart build (ticket #595, spec #577): which picture fills each frame of the plan.
// Pure: the plan's frames, the labelled own pictures and the count the customer approved in, every frame with its
// recorded source out. The order is fixed:
//
//   1. own photos, wherever they fit a frame by content and shape (an item's own photo in its item frame, then a gallery
//      photo the plan does not show elsewhere in the hero and the other block frames);
//   2. fewer image items: an item block drops the items without a fitting own photo while it keeps more than its minimum;
//   3. generated pictures for the frames still empty, at most six per site and never more than the plan's approved
//      count. A frame of a person or a logo is never generated (`picture-roles.mjs`), and no stock picture is ever used.
//
// 🔒 A VIDEO IS NEVER THE DEFAULT HERO BACKGROUND. The hero's image frame takes a photo or a generated image, never a
// video. Only a video frame (a `business.video` link field) takes an own video, and only one that is landscape or near
// square with no text printed over it; otherwise it stays empty. A video is never generated.
//
// 🔒 THE BUSINESS LOGO IS THE BRAND STEP'S. A `business.logo` frame is never filled here and never generated; an award or
// partner logo (`claim.entity_logo`) takes the item's own logo picture or stays empty with a reason.
import { MAX_GENERATED_FRAMES } from './build-contract-plan.mjs'
import { framesOfPlan } from './picture-frames.mjs'
import { fitsFrame, heroFit, reductionsOf } from './picture-fit.mjs'
import { isLabelled, PicturePolicyError } from './picture-labelling.mjs'
import { pictureProblemsOf, videoFits } from './picture-policy-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const heroFirst = (a, b) => (a.place === 'hero' ? 0 : 1) - (b.place === 'hero' ? 0 : 1)

/** What an own picture adds to its frame: the picture, its label and where it came from. */
const own = (picture) => ({
  source: 'own',
  picture: picture.id,
  ref: picture.ref,
  label: picture.label,
  from: list(picture.from)
})

/**
 * The generated count the customer approved. `null` (the plan is being counted, nothing approved yet) allows the cap; an
 * approved count that is missing or not a whole number allows none, and says so in a note.
 */
export function approvedCountOf(approved) {
  if (approved === null || approved === undefined) return { count: MAX_GENERATED_FRAMES, note: null }
  const given = approved?.generated?.frames
  if (Number.isInteger(given) && given >= 0) return { count: given, note: null }
  return {
    count: 0,
    note: {
      code: 'approved_count_invalid',
      given: given === undefined ? null : given,
      message: 'the plan approves no valid generated count, so no picture is generated'
    }
  }
}

/** Step 1: own pictures in item frames, video frames, then the free gallery photos (the hero first, by fit). */
function placeOwn(frames, usable, take, used) {
  const free = (p) => !used.has(p.id)
  for (const frame of frames.filter((f) => f.place === 'item' && f.never !== 'logo_from_brand_step')) {
    const mine = usable.filter((p) => p.item === frame.item && free(p) && fitsFrame(p, frame))
    const picture = mine.find((p) => p.id === frame.item) ?? mine[0]
    if (picture) take(frame, picture)
  }
  for (const frame of frames.filter((f) => f.place === 'video')) {
    const videos = usable.filter((p) => videoFits(p) && free(p))
    const video = videos.find((p) => frame.item && p.item === frame.item) ?? videos[0]
    if (video) take(frame, video)
  }
  const shownItems = new Set(frames.map((f) => f.item).filter(Boolean))
  const gallery = usable.filter((p) => p.itemKind === 'gallery' && !shownItems.has(p.item))
  const freeFrames = frames
    .filter((f) => (f.place === 'hero' || f.place === 'block') && !f.never)
    .sort(heroFirst)
  for (const frame of freeFrames) {
    const fits = gallery.filter((p) => free(p) && fitsFrame(p, frame))
    if (frame.place === 'hero') fits.sort((a, b) => heroFit(b) - heroFit(a))
    if (fits[0]) take(frame, fits[0])
  }
}

/**
 * Assign a picture to every frame of the plan. Every own picture must be labelled first (`labelOwnPictures`).
 * @param {{pages: object[], blocks: Map<string, object>, data: object, pictures: object[],
 *   approved?: {generated?: {frames?: number}} | null}} input `approved` is the plan's pictures summary
 *   (`plan.pictures`); leave it out only to count a plan before it is approved (`picturesOf`)
 * @returns {{frames: object[], reduced: object[], counts: {own: number, generated: number, none: number},
 *   notes: object[]}}
 */
export function assignPictures({ pages, blocks, data, pictures, approved = null }) {
  const unlabelled = list(pictures).filter((p) => !p.stock && !isLabelled(p))
  if (unlabelled.length)
    throw new PicturePolicyError(
      'picture_unlabelled',
      'own pictures must be labelled before they are placed',
      {
        pictures: unlabelled.map((p) => p.id)
      }
    )
  const usable = list(pictures).filter((p) => !p.stock)
  const frames = framesOfPlan(pages, blocks, data)
  const filled = new Map()
  const used = new Set()
  placeOwn(
    frames,
    usable,
    (frame, picture) => {
      used.add(picture.id)
      filled.set(frame.id, own(picture))
    },
    used
  )
  // 2. Fewer image items before anything is generated.
  const reduced = reductionsOf(frames, filled, pages, blocks, pictures)
  const dropped = new Set(reduced.map((r) => `${r.page}.${r.block}.${r.item}`))
  const kept = frames.filter((f) => !f.item || !dropped.has(`${f.page}.${f.block}.${f.item}`))
  // 3. Generated pictures, the hero first, within the cap and the approved count.
  const { count: approvedCount, note } = approvedCountOf(approved)
  const cap = Math.min(MAX_GENERATED_FRAMES, approvedCount)
  let generated = 0
  for (const frame of [...kept].sort(heroFirst)) {
    if (filled.has(frame.id)) continue
    const none = (reason) => filled.set(frame.id, { source: 'none', reason })
    if (frame.place === 'video') none('no_fitting_video')
    else if (frame.people) none('no_generated_people')
    else if (frame.never) none(frame.never)
    else if (generated >= cap)
      none(generated >= MAX_GENERATED_FRAMES ? 'generated_cap' : 'over_approved_count')
    else {
      generated += 1
      const item = frame.item ? data.byId.get(frame.item)?.entry?.label : null
      filled.set(frame.id, {
        source: 'generated',
        generate: { blockType: frame.blockType, ...(item ? { item } : {}), people: false, stock: false }
      })
    }
  }
  const out = kept.map((frame) => ({ ...frame, ...filled.get(frame.id) }))
  const counts = { own: 0, generated: 0, none: 0 }
  for (const frame of out) counts[frame.source] += 1
  const assignment = { frames: out, reduced, counts, notes: note ? [note] : [] }
  const problems = pictureProblemsOf(assignment, pictures, { generated: cap })
  if (problems.length)
    throw new PicturePolicyError('picture_policy_broken', `${problems.length} picture rules broken`, {
      problems
    })
  return assignment
}
