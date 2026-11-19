// The build's failure policy at the write order (#575): a problem the order check or the alt text check finds on one
// item never stops the build. The item is left out the way the order already leaves out what it cannot show: an entry
// becomes a hidden no data entry, a picture a hidden empty frame, an icon the source `none`. Each is listed with its code and id,
// never the words. A problem of no single item (the home page, a block below its minimum, a field with no entry) is
// left as it is, and the check still stops the build on it. Pure.
import { placesOfOrder } from './write-order-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** What an entry keeps when it is left out: its place and declaration, never its words. */
const WORDS = new Set(['value', 'data', 'emphasis', 'from', 'action', 'fallback', 'reason'])

/**
 * Leave out every item a problem names, in place.
 * @param {object} order the write order, changed in place
 * @param {{code: string, at?: string, frame?: string}[]} problems the order check's or the alt check's problems
 * @param {string} at the stage that found them (`order`, `alt`)
 * @returns {{skipped: object[], kept: object[]}} the items left out, and the problems no single item answers
 */
export function degradeOrder(order, problems, at = 'order') {
  const entries = new Map()
  for (const { place } of placesOfOrder(order))
    list(place.fields).forEach((e, i) => entries.set(e.place, { place, i }))
  const pictures = new Map(list(order.pictures).map((p) => [p.frame, p]))
  const icons = new Map(list(order.icons).map((i) => [i.id, i]))
  const skipped = []
  const kept = []
  const done = new Set()
  for (const problem of problems) {
    const id = problem.at ?? problem.frame
    const item = { code: problem.code, op: null, place: id ?? null, reason: null, at }
    if (done.has(id)) {
      skipped.push(item)
      continue
    }
    if (entries.has(id)) {
      const { place, i } = entries.get(id)
      const e = place.fields[i]
      place.fields[i] = {
        ...Object.fromEntries(Object.entries(e).filter(([k]) => !WORDS.has(k))),
        from: 'no-data',
        action: 'hide',
        reason: 'item_refused'
      }
    } else if (pictures.has(id)) {
      const p = pictures.get(id)
      for (const k of ['file', 'ref', 'generate', 'alt', 'substitute', 'sameAs', 'person']) delete p[k]
      // An empty frame is hidden, so the demo picture goes with it (`picture_empty_shown`).
      Object.assign(p, { source: 'none', state: 'hidden', reason: 'item_refused' })
    } else if (icons.has(id)) {
      const icon = icons.get(id)
      delete icon.icon
      icon.source = 'none'
    } else {
      kept.push(problem)
      continue
    }
    done.add(id)
    skipped.push(item)
  }
  return { skipped, kept }
}
