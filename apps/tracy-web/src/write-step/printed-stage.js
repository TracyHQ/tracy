// The printed check of the write step (ADR 0044, decision 12): after the writes, every page that shows a written slot is read as a
// visitor reads it, and each slot's value must be PRINTED there (lib/printed-in-body.js), not only held by the site. Read-back says what
// the database holds; this says what the visitor gets.
//
// A template may print a block only when another of its fields is set: a video poster printed only with a video id. When the plan keeps
// the picture and hides the field it hangs on, the picture is written and never printed. For that case alone (a kept picture of an
// article, in a list row of the kit with a slot the run hid) the stage prints the picture itself: a fallback block at the top of the
// article's full text, which the template prints right where the gated block stood. The block carries `data-slot`, so a later run finds
// it and writes nothing when it is right, and takes it off when the template prints the slot itself again. Any other slot that is not
// printed is only reported: the site check's `written-not-printed` blocks on it.
import {
  fallbackBlock,
  fallbackBlocksIn,
  pictureKey,
  printedSlotsOf,
  sitePrints,
  slotsOnPages
} from '../lib/printed-in-body.js'
import { doorCall } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const articleOf = (slot) => {
  const m = /^article-(\d+)\./.exec(String(slot))
  return m ? Number(m[1]) : null
}

/** Each kit list row's slot ids, by slot id: a template prints or drops a row's fields together. */
function rowMates(kit) {
  const mates = new Map()
  for (const block of each(kit?.blocks))
    for (const list of each(block?.lists))
      for (const row of each(list?.rows)) {
        const ids = each(row?.slots).map((s) => s?.id)
        for (const id of ids) mates.set(id, ids)
      }
  return mates
}

/** Reads every page once; a page that does not answer is null, and says nothing of its slots. */
async function readPages(paths, pageHtml) {
  const pages = new Map()
  for (const path of paths) pages.set(path, await pageHtml(path).catch(() => null))
  return pages
}

/** The article's full text with the fallback blocks it should hold, and which slots each change concerns. */
function nextText(text, { wanted, nativeKeys }) {
  let next = String(text ?? '')
  const held = new Set()
  const removed = []
  for (const block of fallbackBlocksIn(next)) {
    const owner = block.slot
      ? wanted.get(block.slot) && block.slot
      : [...wanted.keys()].find((slot) => !held.has(slot) && pictureKey(wanted.get(slot)) === block.key)
    if (owner && pictureKey(wanted.get(owner)) === block.key && !held.has(owner)) {
      held.add(owner)
      continue
    }
    // A block naming no slot is taken off only when the template now prints its picture itself; otherwise it is not known to be ours.
    if (!block.slot && !nativeKeys.has(block.key)) continue
    next = next.replace(block.whole, '')
    removed.push(block.slot ?? `(${block.key})`)
  }
  const added = [...wanted.keys()].filter((slot) => !held.has(slot))
  next = added.map((slot) => fallbackBlock(slot, wanted.get(slot))).join('') + next
  return { next, added, removed }
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: object, lines: object[], keptPages: { id: string, path: string }[],
 *   pageHtml: (path: string) => Promise<string | null> }} input `lines`: the report's slot lines; `pageHtml`: a page as the site serves it
 * @returns {Promise<object>} the report's `printed` section
 */
export async function runPrintedStage({ door, siteKey, kit, lines, keptPages, pageHtml }) {
  const call = doorCall(door, siteKey)
  const slots = printedSlotsOf(lines, kit)
  const status = new Map(each(lines).map((l) => [l.slot, l.status]))
  const onPages = slotsOnPages(kit, keptPages)
  const pages = await readPages([...onPages.keys()], pageHtml)
  const native = sitePrints({ onPages, pages, slots, native: true })
  const mates = rowMates(kit)
  const values = new Map(slots.map((s) => [s.slot, s]))
  const gated = (slot) =>
    values.get(slot)?.kind === 'picture' &&
    articleOf(slot) !== null &&
    each(mates.get(slot)).some((id) => id !== slot && status.get(id) === 'hidden')
  const wantedBy = new Map()
  for (const { slot } of native.notPrinted) {
    if (!gated(slot)) continue
    const article = articleOf(slot)
    if (!wantedBy.has(article)) wantedBy.set(article, new Map())
    wantedBy.get(article).set(slot, values.get(slot).value)
  }
  // Every article a kit row picture of a kept page sits on: a block a run left there may need to come off.
  const shown = new Set([...onPages.values()].flat())
  const articles = new Set(wantedBy.keys())
  for (const [slot, ids] of mates)
    if (shown.has(slot) && ids.length > 1 && articleOf(slot) !== null) articles.add(articleOf(slot))
  const nativeKeys = new Set(
    [...native.printed.keys()]
      .filter((s) => values.get(s)?.kind === 'picture')
      .map((s) => pictureKey(values.get(s).value))
  )
  const fallback = { writes: 0, added: [], removed: [], failed: [] }
  const changed = new Set()
  for (const id of [...articles].sort((a, b) => a - b)) {
    try {
      const answer = await call('content.get', { kind: 'article', id })
      const text = String(answer?.item?.fulltext ?? '')
      const { next, added, removed } = nextText(text, { wanted: wantedBy.get(id) ?? new Map(), nativeKeys })
      if (next === text) continue
      await call('content.update', {
        apply_id: `printed-fallback-${id}`,
        kind: 'article',
        id,
        fields: { fulltext: next }
      })
      fallback.writes += 1
      fallback.added.push(...added)
      fallback.removed.push(...removed)
      changed.add(id)
    } catch (error) {
      fallback.failed.push({ article: id, reason: String(error?.message ?? error) })
    }
  }
  // Only the pages showing a slot of a changed article are read again.
  for (const [path, ids] of onPages)
    if (ids.some((slot) => changed.has(articleOf(slot))))
      pages.set(path, await pageHtml(path).catch(() => null))
  const final = sitePrints({ onPages, pages, slots })
  const viaFallback = [...final.printed]
    .filter(([, p]) => p.via === 'fallback')
    .map(([slot, p]) => ({ slot, page: p.page, article: articleOf(slot) }))
  const notPrinted = final.notPrinted.map(({ slot, pages: read }) => ({
    slot,
    kind: values.get(slot).kind,
    ordered: values.get(slot).value,
    pages: read,
    reason: gated(slot)
      ? 'a fallback block was written for this picture, and the page still does not print it'
      : 'the value is written and no page that shows this slot prints it'
  }))
  return {
    pages: {
      read: [...pages.values()].filter((h) => typeof h === 'string').length,
      unread: [...pages].filter(([, h]) => typeof h !== 'string').map(([p]) => p)
    },
    counts: {
      checked: final.printed.size + final.notPrinted.length,
      printed: final.printed.size,
      viaFallback: viaFallback.length,
      notPrinted: notPrinted.length,
      unread: final.unread.length,
      writes: fallback.writes
    },
    viaFallback,
    notPrinted,
    unread: final.unread,
    fallback
  }
}
