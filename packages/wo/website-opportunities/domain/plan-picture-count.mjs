// One count of the owner's photos per plan (#575 build chat, a real plan card): the pictures summary and the left out
// list are read from the same placement, so the numbers a card shows add up. The step chain kept one list: a photo is
// placed (in any frame) or unused, never both, with one reason (`quickstart-picture-plan.js` `unused`). Two faults of
// the build chat broke that, both measured on one plan (19 photos, 15 placed, 12 in galleries, 7 left out):
//   - a gallery photo no gallery shows is left out by placement (`no_gallery_room`, `plan-placement.mjs`) before the
//     pictures are placed; the policy then gives free photos to the hero and other block frames
//     (`picture-policy-own.mjs`), so a photo could be both placed and left out;
//   - the summary named its own reason for the photos it did not place (`no_fitting_frame`, `picture-tally.mjs`), so
//     one photo had two reasons and the two lists counted different things.
// A third, found by the guard on a plan request: a photo the owner asked to take off a gallery was given to the hero.
// The photos the owner keeps off the site or asked off fill no frame (`keptOffPhotosOf`). Here, after the gate's last
// placement: a `no_gallery_room` entry of a photo a frame takes leaves the list (its
// sentence already says such a photo "may be used elsewhere on the site"), and every unused photo whose item the list
// names is counted under that entry's code. `pictureCountProblems` is the gate's guard that the numbers agree. Pure.
import { GALLERY_ROOM_CODE, withCountedReasons } from './plan-left-out-plain.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The plan's left out list without the `no_gallery_room` entries of photos a frame takes, worded for the rest, and
 * the items those entries named (`framed`): the data accounting counts them placed, by the pictures.
 */
export function withoutPlacedPhotos(leftOut, placedItems) {
  const framed = new Set()
  const kept = list(leftOut).filter((e) => {
    const placed = e.code === GALLERY_ROOM_CODE && e.item !== undefined && placedItems.has(e.item)
    if (placed) framed.add(e.item)
    return !placed
  })
  return { leftOut: framed.size === 0 ? leftOut : withCountedReasons(kept), framed }
}

/** The data accounting with the items a picture frame shows moved from left out to placed. */
export function withFramedPlaced(accounting, framed) {
  if (!accounting || framed.size === 0) return accounting
  const moved = accounting.leftOut.filter((id) => framed.has(id))
  return {
    ...accounting,
    placed: [...accounting.placed, ...moved],
    leftOut: accounting.leftOut.filter((id) => !framed.has(id))
  }
}

/**
 * The items no picture frame may show: what the owner keeps off the site (`withheld`) and what the owner asked to take
 * off (a model entry keeping the owner's reason, `askedOff`). A photo left out for want of gallery room stays free.
 */
export function keptOffPhotosOf(modelLeftOut, withheld, askedOff) {
  const out = new Set(withheld)
  for (const e of list(modelLeftOut)) if (e?.item !== undefined && askedOff?.has(e.reason)) out.add(e.item)
  return out
}

/**
 * The items a plan's left out list keeps off every frame: each it names with a reason other than `no_gallery_room`
 * (whose sentence says the photo may be used elsewhere). Read at compose time and again by the pictures step at build
 * time (`picture-step.mjs`), so a photo the owner took off by a change request reaches no frame there either.
 */
export function leftOutKeptOff(leftOut) {
  const out = new Set()
  for (const e of list(leftOut)) if (e?.item !== undefined && e.code !== GALLERY_ROOM_CODE) out.add(e.item)
  return out
}

/** The code of the left out entry that names each item, the first one when several do. */
export function leftOutCodesOf(leftOut) {
  const codes = new Map()
  for (const e of list(leftOut))
    if (e.kind === 'item' && e.item !== undefined && e.code && !codes.has(e.item)) codes.set(e.item, e.code)
  return codes
}

/**
 * The problems of a plan whose picture numbers do not agree, as `{at, message}`. A plan without the photo counts (made
 * before them) has none. Checked: photos = placed + every unused count; each photo of the plan is left out once; the
 * photos left out for a reason are no more than the photos the summary counts unused for it, and as many for
 * `no_gallery_room`, the reason the card words with a count.
 * @param {{items?: object[], pictures?: {own?: object}, leftOut?: object[]}} plan
 */
export function pictureCountProblems(plan) {
  const own = plan?.pictures?.own
  if (!own || own.photos === undefined || own.placed === undefined || own.unused === undefined) return []
  const problems = []
  const unusedOf = new Map(list(own.unused).map((u) => [u.code, u.count]))
  const unused = [...unusedOf.values()].reduce((n, c) => n + c, 0)
  if (own.photos !== own.placed + unused)
    problems.push({
      at: 'pictures.own',
      message: `photos (${own.photos}) must be placed (${own.placed}) plus unused (${unused})`
    })
  const photoItems = new Set(
    list(plan.items)
      .filter((i) => i?.kind === 'gallery')
      .map((i) => i.id)
  )
  const leftOutPhotos = list(plan.leftOut).filter((e) => e?.kind === 'item' && photoItems.has(e.item))
  const seen = new Set()
  const byCode = new Map()
  for (const e of leftOutPhotos) {
    if (seen.has(e.item))
      problems.push({ at: `leftOut[${e.item}]`, message: `photo ${e.item} is left out twice` })
    seen.add(e.item)
    byCode.set(e.code, (byCode.get(e.code) ?? 0) + 1)
  }
  for (const [code, n] of byCode) {
    const counted = unusedOf.get(code) ?? 0
    if (code === GALLERY_ROOM_CODE ? n !== counted : n > counted)
      problems.push({
        at: 'pictures.own.unused',
        message: `${n} photos are left out as ${code}, the summary counts ${counted} unused for it`
      })
  }
  if (!byCode.has(GALLERY_ROOM_CODE) && unusedOf.has(GALLERY_ROOM_CODE))
    problems.push({
      at: 'pictures.own.unused',
      message: `the summary counts ${unusedOf.get(GALLERY_ROOM_CODE)} photos ${GALLERY_ROOM_CODE}, the left out list none`
    })
  return problems
}
