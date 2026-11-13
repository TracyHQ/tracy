// When one picture may show in several frames (ticket #595, review 13/11). A drawing or an own photo of an item shows
// again only in a frame of the same shape class (portrait, landscape or square, by the frame's declared size), never
// twice on one page; a frame without a declared size reuses nothing and gets its own picture. A gallery photo is used
// once (`picture-policy-own.mjs`). The one exception: a person's own photo may repeat wherever it fits, the same page
// too, for a person is never drawn and the real photo twice beats initials beside it. Pure.

/** A frame's shape class by its declared size, or null when it has none (it then reuses nothing). */
export const shapeClassOf = (frame) =>
  frame?.size && ['portrait', 'landscape', 'square'].includes(frame.shape) ? frame.shape : null

/**
 * Whether a picture already shown in `uses` may show in `frame` too: the same shape class, never on the same page.
 * @param {object[]} uses the frames that show the picture so far
 * @param {object} frame
 */
export function mayReuse(uses, frame) {
  const shape = shapeClassOf(frame)
  return shape !== null && (uses ?? []).every((u) => shapeClassOf(u) === shape && u.page !== frame.page)
}

/** Which picture a decided frame shows, for grouping its reuses; null for a frame that shows no shared picture. */
function shownOf(frame) {
  if (frame.sameAs) return null
  // A person's own photo may show in every frame of that person it fits (people are never drawn).
  if (frame.source === 'own' && (frame.itemKind === 'gallery' || frame.people)) return null
  if (frame.source === 'own') return `own:${frame.picture}`
  if (frame.source === 'generated') return `drawn:${frame.reuses ?? frame.id}`
  return null
}

/**
 * The reuse problems of an assignment: `reuse_shape_unfit` (a picture shown in frames of different shape classes, or in
 * a frame without a size) and `reuse_same_page` (a picture shown twice on one page). A drawing's place is its drawn
 * frame, an own photo's the first frame showing it; every other frame is held to the frames before it.
 * @param {object[]} frames the frames of `assignPictures`
 * @returns {Array<{code: string, at: string, message: string}>}
 */
export function reuseProblemsOf(frames) {
  const groups = new Map()
  for (const frame of frames ?? []) {
    const key = shownOf(frame)
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
    const key = shownOf(frame)
    const before = seen.get(key) ?? []
    if (before.length && before.some((u) => u.page === frame.page))
      problems.push({ code: 'reuse_same_page', at: frame.id, message: 'a picture is shown once on a page' })
    else if (before.length && !mayReuse(before, frame))
      problems.push({
        code: 'reuse_shape_unfit',
        at: frame.id,
        message: 'a picture shows again only in a frame of the same declared shape'
      })
    seen.set(key, [...before, frame])
  }
  return problems
}
