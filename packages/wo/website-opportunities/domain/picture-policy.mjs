// The picture policy of an AI quickstart build (ticket #595, spec #577): which picture fills each frame of the plan.
// Pure: the plan's frames, the labelled own pictures and the count the customer approved in, every frame with its
// recorded source out. The order is fixed:
//
//   1. own photos, wherever they fit a frame by content and shape (`picture-policy-own.mjs`);
//   2. fewer gallery items: a gallery drops the items without a fitting own photo while it keeps more than its minimum.
//      Every other item (a service, a package, a person) stays whether or not it has a photo (`picture-fit.mjs`);
//   3. generated pictures for every frame still empty that may be drawn: no cap per site and no cap per plan (D45). The
//      plan's generated count is an estimate made before the own photos are labelled; a photo that turns out unfit
//      here is replaced by a drawing, never left as an empty frame. A frame of a person, a logo or a gallery is never
//      generated (`picture-roles.mjs`), and no stock picture is ever used. A frame that gets no picture stays empty
//      with its reason, and the write step hides it.
//
// 🔒 A PERSON WITHOUT A PHOTO SHOWS THEIR INITIALS (the locked decision on the coach cards): the frame of a named person
// (`picture-people.mjs`) with no own photo of them takes `source: 'initials'` and the substitute of `person-avatar.mjs`,
// never an empty frame, never a drawn person and never another person's photo.
//
// ONE DRAWING PER ITEM, FIELD KIND AND ASPECT RATIO. An item shown on several pages is drawn once for frames whose
// aspect ratios lie within 15% of each other: its other frames of the same kind in that band on other pages take the
// same `generate` and name the drawn frame in `reuses`, and count once. A frame outside the band, on the same page, or
// without a declared size gets its own (`picture-reuse.mjs`). `generate.size` is the size to draw: the largest width
// and the largest height among the frames that show the drawing.
//
// 🔒 A VIDEO IS NEVER THE DEFAULT HERO BACKGROUND. The hero's image frame takes a photo or a generated image, never a
// video. Only a video frame (a `business.video` link field) takes an own video, and only one that is landscape or near
// square with no text printed over it; otherwise it stays empty. A video is never generated.
//
// A LIGHT AND DARK PAIR IS ONE PICTURE. The variant of a pair (Contract A `variantOf`, a logo or a signature kept in two
// files) is not filled on its own: it takes its base frame's decision, marked `sameAs` the base, and a generated one is
// drawn and counted once.
//
// 🔒 THE BUSINESS LOGO IS THE BRAND STEP'S. A `business.logo` frame is never filled here and never generated; an award or
// partner logo (`claim.entity_logo`) takes the item's own logo picture or stays empty with a reason.
import { framesOfPlan } from './picture-frames.mjs'
import { reductionsOf } from './picture-fit.mjs'
import { initialsDecisionOf } from './picture-people.mjs'
import { pictureProblemsOf } from './picture-policy-check.mjs'
import { mayReuse, reuseProblemsOf } from './picture-reuse.mjs'
import { checkLabelled, checkPicturePairs } from './picture-policy-input.mjs'
import { ownDecisionOf, placeOwn } from './picture-policy-own.mjs'
import { PicturePolicyError } from './picture-labelling.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const heroFirst = (a, b) => (a.place === 'hero' ? 0 : 1) - (b.place === 'hero' ? 0 : 1)

/** The size to draw a picture at: the largest width and the largest height among the frames that show it. */
function drawSizeOf(frames) {
  const sized = frames.filter((f) => f.size?.width > 0 && f.size?.height > 0)
  if (!sized.length) return null
  return {
    width: Math.max(...sized.map((f) => f.size.width)),
    height: Math.max(...sized.map((f) => f.size.height))
  }
}

/**
 * Assign a picture to every frame of the plan. Every own picture must be labelled first (`labelOwnPictures`). The
 * plan's approved pictures summary is not an input: its generated count is an estimate, never a cap (D45).
 * @param {{pages: object[], blocks: Map<string, object>, data: object, pictures: object[]}} input
 * @returns {{frames: object[], reduced: object[], droppedFrames: Array<{frame: string, item: string, reason: string}>,
 *   counts: {own: number, generated: number, initials: number, none: number, variants: number, reused: number},
 *   notes: object[]}} `droppedFrames`: the frames of the reduced items, which the built site no longer shows
 */
export function assignPictures({ pages, blocks, data, pictures }) {
  checkLabelled(pictures)
  const usable = list(pictures).filter((p) => !p.stock)
  const all = framesOfPlan(pages, blocks, data)
  const baseOf = (f) => `${f.id.slice(0, -f.field.length)}${f.variantOf}`
  checkPicturePairs(all, baseOf)
  const frames = all.filter((f) => f.variantOf === undefined)
  const filled = new Map()
  placeOwn(frames, usable, (frame, picture) => filled.set(frame.id, ownDecisionOf(picture)))
  // 2. Fewer gallery items before anything is generated; every other item stays.
  const reduced = reductionsOf(frames, filled, pages, blocks, pictures)
  const dropped = new Set(reduced.map((r) => `${r.page}.${r.block}.${r.item}`))
  const kept = frames.filter((f) => !f.item || !dropped.has(`${f.page}.${f.block}.${f.item}`))
  // 3. Generated pictures, the hero first, for every drawable frame still empty (no cap, D45).
  // One drawing per item, field kind and aspect ratio band: shown again on another page, it is reused, counted once.
  const drawings = new Map()
  const shownIn = new Map()
  const reusable = (key, frame) => (drawings.get(key) ?? []).find((d) => mayReuse(shownIn.get(d), frame))
  for (const frame of [...kept].sort(heroFirst)) {
    if (filled.has(frame.id)) continue
    const none = (reason) => filled.set(frame.id, { source: 'none', reason })
    const key = frame.item ? `${frame.item}|${frame.kind}` : null
    if (frame.place === 'video') none('no_fitting_video')
    else if (frame.people)
      filled.set(
        frame.id,
        frame.person ? initialsDecisionOf(frame, data) : { source: 'none', reason: 'no_generated_people' }
      )
    else if (frame.never) none(frame.never)
    else if (key && reusable(key, frame)) {
      const drawn = reusable(key, frame)
      shownIn.get(drawn).push(frame)
      filled.set(frame.id, { ...filled.get(drawn), reuses: drawn })
    } else {
      const item = frame.item ? data.byId.get(frame.item)?.entry?.label : null
      filled.set(frame.id, {
        source: 'generated',
        generate: { blockType: frame.blockType, ...(item ? { item } : {}), people: false, stock: false }
      })
      if (key) drawings.set(key, [...(drawings.get(key) ?? []), frame.id])
      shownIn.set(frame.id, [frame])
    }
  }
  // Every drawing carries the size to draw it at, the same in each frame that shows it.
  for (const shown of shownIn.values()) {
    const size = drawSizeOf(shown)
    if (!size) continue
    for (const f of shown) {
      const decision = filled.get(f.id)
      filled.set(f.id, { ...decision, generate: { ...decision.generate, size } })
    }
  }
  // A pair's variant follows its base, in the place the base holds in the order.
  const keptIds = new Set(kept.map((f) => f.id))
  const out = all
    .filter((f) => (f.variantOf === undefined ? keptIds.has(f.id) : keptIds.has(baseOf(f))))
    .map((frame) =>
      frame.variantOf === undefined
        ? { ...frame, ...filled.get(frame.id) }
        : { ...frame, ...filled.get(baseOf(frame)), sameAs: baseOf(frame) }
    )
  // One count per picture decision: a pair's variant (`sameAs`) shows its base's decision and is counted in `variants`
  // only, a reused drawing (`reuses`) in `reused` only. Every frame is still in `frames`, so declared = decided.
  const counts = { own: 0, generated: 0, initials: 0, none: 0, variants: 0, reused: 0 }
  for (const frame of out) counts[frame.sameAs ? 'variants' : frame.reuses ? 'reused' : frame.source] += 1
  // The frames of a dropped item leave with it; each is kept here so every declared frame stays accounted for.
  const droppedFrames = all
    .filter((f) => f.item && dropped.has(`${f.page}.${f.block}.${f.item}`))
    .map((f) => ({ frame: f.id, item: f.item, reason: 'item_dropped' }))
  const assignment = { frames: out, reduced, droppedFrames, counts, notes: [] }
  const problems = [
    ...reuseProblemsOf(
      out.filter((f) => f.source === 'own' || f.source === 'generated'),
      pictures
    ),
    ...pictureProblemsOf(assignment, pictures)
  ]
  if (problems.length)
    throw new PicturePolicyError('picture_policy_broken', `${problems.length} picture rules broken`, {
      problems
    })
  return assignment
}
