// When one picture may show in several frames (ticket #595, two reviews of 13/11). A drawing or an own photo of an
// item shows again only in a frame whose aspect ratio (width over height, by the declared size) lies within 15% of
// every frame that shows it already, never twice on one page; a frame without a declared size reuses nothing and gets
// its own picture. A gallery photo is used once (`picture-policy-own.mjs`). The one exception: a PERSON's own photo
// (a photo of a person item) may repeat wherever it fits, the same page too, for a person is never drawn and the real
// photo twice beats initials beside it. A people frame showing another photo has no such exception. Pure.

/** How far apart two aspect ratios may lie for one picture to show in both: the larger at most 15% over the smaller. */
export const REUSE_RATIO_BAND = 0.15

/** A frame's aspect ratio by its declared size, or null when it has none (it then reuses nothing). */
export const aspectOf = (frame) =>
  frame?.size?.width > 0 && frame?.size?.height > 0 ? frame.size.width / frame.size.height : null

/** Whether two aspect ratios lie within the reuse band of each other. */
const inBand = (a, b) =>
  a !== null && b !== null && Math.max(a, b) / Math.min(a, b) <= 1 + REUSE_RATIO_BAND + 1e-9

/**
 * Whether a picture already shown in `uses` may show in `frame` too: an aspect ratio within 15% of each of them,
 * never on the same page.
 * @param {object[]} uses the frames that show the picture so far
 * @param {object} frame
 */
export function mayReuse(uses, frame) {
  const ratio = aspectOf(frame)
  return ratio !== null && (uses ?? []).every((u) => inBand(aspectOf(u), ratio) && u.page !== frame.page)
}

/**
 * Which picture a decided frame shows, for grouping its reuses; null for a frame that shows no shared picture.
 * @param {(id: string) => object | undefined} pictureOf the own picture record of an id
 */
function shownOf(frame, pictureOf) {
  if (frame.sameAs) return null
  // A person's own photo may show in every frame of that person it fits (people are never drawn); a gallery photo is
  // held to one use where it is placed.
  const kind = frame.source === 'own' ? (pictureOf(frame.picture)?.itemKind ?? null) : null
  if (frame.source === 'own' && (kind === 'gallery' || kind === 'person')) return null
  if (frame.source === 'own') return `own:${frame.picture}`
  if (frame.source === 'generated') return `drawn:${frame.reuses ?? frame.id}`
  return null
}

/**
 * The reuse problems of an assignment: `reuse_shape_unfit` (a picture shown in frames whose aspect ratios lie more
 * than 15% apart, or in a frame without a size) and `reuse_same_page` (a picture shown twice on one page). A drawing's
 * place is its drawn frame, an own photo's the first frame showing it; every other frame is held to the frames before.
 * @param {object[]} frames the frames of `assignPictures`
 * @param {object[]} [pictures] the own picture records the frames draw on (a person's photo may repeat)
 * @returns {Array<{code: string, at: string, message: string}>}
 */
export function reuseProblemsOf(frames, pictures = []) {
  const byId = new Map((pictures ?? []).map((p) => [p.id, p]))
  const pictureOf = (id) => byId.get(id)
  const groups = new Map()
  for (const frame of frames ?? []) {
    const key = shownOf(frame, pictureOf)
    if (key) groups.set(key, [...(groups.get(key) ?? []), frame])
  }
  // A drawing's place is its drawn frame (no `reuses`); an own photo's, the first frame that shows it.
  const ordered = [...groups.values()].flatMap((group) => [
    ...group.filter((f) => f.source !== 'generated' || !f.reuses),
    ...group.filter((f) => f.source === 'generated' && f.reuses)
  ])
  const seen = new Map()
  const problems = []
  for (const frame of ordered) {
    const key = shownOf(frame, pictureOf)
    const before = seen.get(key) ?? []
    if (before.length && before.some((u) => u.page === frame.page))
      problems.push({ code: 'reuse_same_page', at: frame.id, message: 'a picture is shown once on a page' })
    else if (before.length && !mayReuse(before, frame))
      problems.push({
        code: 'reuse_shape_unfit',
        at: frame.id,
        message: 'a picture shows again only in a frame of a declared size within 15% of its aspect ratio'
      })
    seen.set(key, [...before, frame])
  }
  return problems
}
