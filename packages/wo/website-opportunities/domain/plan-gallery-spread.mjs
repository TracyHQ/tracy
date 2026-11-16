// Galleries on several pages (run 7 of the release gate). A gallery photo is shown once on the site: the picture policy
// gives each own gallery photo to one frame (`picture-policy-own.mjs`), so a gallery the model repeats on a second page
// with the same photos finds them all taken by the first page and is cut to its minimum. Two rules of the gate, pure:
//   - `spreadGalleries`, before placement: a gallery photo a block shows that an earlier block of the plan already
//     shows is swapped for one of the business's gallery photos the plan shows nowhere, while there is one, so the
//     block keeps the count the model gave it (recorded in `placed`, `how: GALLERY_SPREAD`);
//   - `shownElsewhereLeftOut`, after the pictures: the photos a gallery still loses that way are said in one left out
//     entry per gallery, code `gallery_photo_shown_elsewhere` with `params.count`, never as photos that do not fit.
const list = (value) => (Array.isArray(value) ? value : [])

/** How `placed` names a photo the gate gave a gallery in place of one an earlier gallery shows. */
export const GALLERY_SPREAD = 'gallery photo shown once'
/** The code of the photos a gallery loses because each already shows in another gallery. */
export const SHOWN_ELSEWHERE_CODE = 'gallery_photo_shown_elsewhere'

/** The sentence of `count` photos a gallery does not show because they already show in another one. */
export const shownElsewhereReason = (count) =>
  count === 1
    ? 'This photo already shows in a gallery on another page, and each photo shows once on your site, so this gallery shows one fewer.'
    : `These ${count} photos already show in a gallery on another page, and each photo shows once on your site, so this gallery shows ${count} fewer.`

/**
 * Give a repeated gallery photo's place to a gallery photo the plan shows nowhere, in the order of the pages.
 * @param {object[]} pages placed pages (`{id, blocks: [{id, data}]}`)
 * @param {{data: object, leftOutIds?: Set<string>}} context the plan data; ids left out or kept off the site stay out
 * @returns {{pages: object[], placed: Array<{item: string, page: string, block: string, how: string}>}}
 */
export function spreadGalleries(pages, { data, leftOutIds = new Set() }) {
  const isGallery = (id) => data.byId.get(id)?.kind === 'gallery'
  const shown = new Set(list(pages).flatMap((p) => list(p.blocks).flatMap((b) => list(b.data))))
  const free = data.items
    .map((i) => i.id)
    .filter((id) => isGallery(id) && !shown.has(id) && !leftOutIds.has(id) && !data.withheld?.has(id))
  const seen = new Set()
  const placed = []
  const out = list(pages).map((page) => ({
    ...page,
    blocks: list(page.blocks).map((block) => {
      const ids = list(block.data).map((id) => {
        if (!isGallery(id) || !seen.has(id) || free.length === 0) return id
        const swapped = free.shift()
        placed.push({ item: swapped, page: page.id, block: block.id, how: GALLERY_SPREAD })
        return swapped
      })
      for (const id of ids) if (isGallery(id)) seen.add(id)
      return { ...block, data: ids }
    })
  }))
  return { pages: out, placed }
}

/**
 * The gallery items the picture policy dropped whose own photo shows in another frame, said once per gallery with
 * their count, and the other reductions as they came.
 * @param {Array<{page: string, block: string, item: string, reason: string}>} reduced `assignPictures` reductions
 * @param {object[]} frames the assigned frames (`source: 'own'` carries its `picture` id)
 * @param {object[]} pictures the own pictures, each with the `item` it belongs to
 * @returns {{entries: object[], rest: object[]}}
 */
export function shownElsewhereLeftOut(reduced, frames, pictures) {
  const itemOf = new Map(list(pictures).map((p) => [p.id, p.item]))
  const shownItems = new Set(
    list(frames)
      .filter((f) => f.source === 'own')
      .map((f) => itemOf.get(f.picture))
  )
  const byBlock = new Map()
  const rest = []
  for (const r of list(reduced)) {
    if (!shownItems.has(r.item)) {
      rest.push(r)
      continue
    }
    const at = `${r.page}.${r.block}`
    byBlock.set(at, (byBlock.get(at) ?? 0) + 1)
  }
  const entries = [...byBlock.values()].map((count) => ({
    what: `${count} gallery ${count === 1 ? 'photo' : 'photos'}`,
    kind: 'item',
    reason: shownElsewhereReason(count),
    code: SHOWN_ELSEWHERE_CODE,
    params: { count }
  }))
  return { entries, rest }
}
