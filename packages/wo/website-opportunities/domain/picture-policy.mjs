// The picture policy of an AI quickstart build (ticket #595, spec #577): which picture fills each frame of the plan.
// Pure: the plan's frames, the labelled own pictures and the count the customer approved in, every frame with its
// recorded source out. The order is fixed:
//
//   1. own photos, wherever they fit a frame (an item's own photo in its item frame, then a gallery photo the plan does
//      not show elsewhere in the hero and the other block frames);
//   2. fewer image items: an item block drops the items without an own photo while it keeps more than its minimum;
//   3. generated pictures for the frames still empty, at most six per site and never more than the plan's approved
//      count. A frame of a person is never generated, and no stock picture is ever used.
//
// 🔒 A VIDEO IS NEVER THE DEFAULT HERO BACKGROUND. The hero's image frame takes a photo or a generated image, never a
// video. Only a frame the template marks as a video frame takes an own video, and only one that is landscape or near
// square with no text printed over it; otherwise it stays empty. A video is never generated.
import { MAX_GENERATED_FRAMES } from './build-contract-plan.mjs'
import { framesOfPlan } from './picture-frames.mjs'
import { isLabelled, PicturePolicyError } from './picture-labelling.mjs'
import { pictureProblemsOf, videoFits } from './picture-policy-check.mjs'
import { heroScore, NOT_A_HERO, orientationOf, resolutionGradeOf } from './pictures/asset-labels.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const orientation = (p) =>
  p.orientation && p.orientation !== 'unknown' ? p.orientation : orientationOf(p.width, p.height)

/** What an own picture adds to its frame: the picture, its label and where it came from. */
const own = (picture) => ({
  source: 'own',
  picture: picture.id,
  ref: picture.ref,
  label: picture.label,
  from: list(picture.from)
})

/** Whether a photo may fill a hero or block frame: a photograph of the business that fits the frame's shape, never a
 * logo or a text graphic. */
function fitsFree(picture, frame) {
  if (picture.media !== 'photo' || NOT_A_HERO.has(picture.content)) return false
  const shape = orientation(picture)
  if (frame.place === 'hero' && shape === 'portrait') return false
  // A photo fits a frame of its own shape or a square one; a landscape frame never takes a portrait photo, nor back.
  const opposite = { landscape: 'portrait', portrait: 'landscape' }
  return opposite[frame.shape] !== shape
}

/** How well a photo fits the hero, by the shared hero score of its labels. */
const heroFit = (p) =>
  heroScore({
    orientation: orientation(p),
    quality: p.quality ?? resolutionGradeOf(p.width, p.height),
    content: p.content
  })

/** Frames whose items are dropped: per item block, the items without an own photo while it keeps more than its min. */
function reductionsOf(frames, filled, pages, blocks) {
  const reduced = []
  for (const page of list(pages))
    for (const block of list(page.blocks)) {
      const mine = frames.filter((f) => f.block === block.id && f.page === page.id && f.place === 'item')
      const shown = [...new Set(mine.map((f) => f.item))]
      const bare = shown.filter((item) => mine.some((f) => f.item === item && !f.people && !filled.has(f.id)))
      const min = Math.max(1, Number(blocks.get(block.block)?.items?.min ?? 1))
      let count = shown.length
      for (const item of bare.reverse()) {
        if (count <= min) break
        count -= 1
        reduced.push({ page: page.id, block: block.id, item, reason: 'no_own_photo' })
      }
    }
  return reduced
}

/**
 * Assign a picture to every frame of the plan. Every own picture must be labelled first (`labelOwnPictures`).
 * @param {{pages: object[], blocks: Map<string, object>, data: object, pictures: object[],
 *   approved?: {generated?: {frames?: number}}}} input `approved` is the plan's pictures summary (`plan.pictures`)
 * @returns {{frames: object[], reduced: object[], counts: {own: number, generated: number, none: number}}}
 */
export function assignPictures({ pages, blocks, data, pictures, approved }) {
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
  const take = (frame, picture) => {
    used.add(picture.id)
    filled.set(frame.id, own(picture))
  }
  // 1. Own pictures: an item's own photo, a fitting video, then free gallery photos (the hero first, by fit).
  for (const frame of frames.filter((f) => f.place === 'item')) {
    const mine = usable.filter((p) => p.item === frame.item && p.media === 'photo' && !used.has(p.id))
    const picture = mine.find((p) => p.id === frame.item) ?? mine[0]
    if (picture) take(frame, picture)
  }
  for (const frame of frames.filter((f) => f.place === 'video')) {
    const video = usable.find((p) => videoFits(p) && !used.has(p.id))
    if (video) take(frame, video)
  }
  const shownItems = new Set(frames.map((f) => f.item).filter(Boolean))
  const free = usable.filter((p) => p.itemKind === 'gallery' && !shownItems.has(p.item))
  const freeFrames = frames
    .filter((f) => f.place === 'hero' || f.place === 'block')
    .sort((a, b) => (a.place === 'hero' ? 0 : 1) - (b.place === 'hero' ? 0 : 1))
  for (const frame of freeFrames) {
    const fits = free.filter((p) => !used.has(p.id) && fitsFree(p, frame))
    if (frame.place === 'hero') fits.sort((a, b) => heroFit(b) - heroFit(a))
    if (fits[0]) take(frame, fits[0])
  }
  // 2. Fewer image items before anything is generated.
  const reduced = reductionsOf(frames, filled, pages, blocks)
  const dropped = new Set(reduced.map((r) => `${r.page}.${r.block}.${r.item}`))
  const kept = frames.filter((f) => !f.item || !dropped.has(`${f.page}.${f.block}.${f.item}`))
  // 3. Generated pictures, the hero first, within the cap and the approved count.
  const approvedCount = Number(approved?.generated?.frames)
  const cap = Math.min(
    MAX_GENERATED_FRAMES,
    Number.isFinite(approvedCount) ? approvedCount : MAX_GENERATED_FRAMES
  )
  let generated = 0
  const order = [...kept].sort((a, b) => (a.place === 'hero' ? 0 : 1) - (b.place === 'hero' ? 0 : 1))
  for (const frame of order) {
    if (filled.has(frame.id)) continue
    if (frame.place === 'video') filled.set(frame.id, { source: 'none', reason: 'no_fitting_video' })
    else if (frame.people) filled.set(frame.id, { source: 'none', reason: 'no_generated_people' })
    else if (generated >= cap)
      filled.set(frame.id, {
        source: 'none',
        reason: generated >= MAX_GENERATED_FRAMES ? 'generated_cap' : 'over_approved_count'
      })
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
  const assignment = { frames: out, reduced, counts }
  const problems = pictureProblemsOf(assignment, pictures)
  if (problems.length)
    throw new PicturePolicyError('picture_policy_broken', `${problems.length} picture rules broken`, {
      problems
    })
  return assignment
}
