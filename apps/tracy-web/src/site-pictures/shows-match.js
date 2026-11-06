// Owner photos placed in the tiles of one list by what each tile shows (card AV). An `any-real` tile takes any owner
// photo that fits, but the plan still gives each tile a subject (`shows`, `mustInclude`) and the writer's alt follows
// it, so a photo in the wrong tile reads as a wrong alt. Once code has filled the tiles of a list (fill-frames.js), the
// photos of those tiles, and any usable photo no frame took, are paired with the tiles by the word overlap between the
// vision's description of the photo (the brief's `caption` and its `depicts` quote) and the tile's subject words
// (lib/alt-compare.js contentWords): the best scoring pairs first. A pair is kept only when the photo cuts well for the
// tile (cut-photo.js: the size and crop rules); the tiles no pair matched keep a photo of the list as before, and when
// any tile is left without one the list keeps its first placement. No photo is shown twice on a page, and no model is
// called. A tile with text over its picture keeps the darker-first order (darken.js) and is left as it is.
import { contentWords } from '../lib/alt-compare.js'
import { cutPhoto } from './cut-photo.js'
import { wantsDark } from './darken.js'
import { placedEntry } from './frame-entries.js'
import { sameService } from './photo-shortlist.js'

const words = (...texts) => contentWords(texts.filter((t) => typeof t === 'string').join(' '))

/** The words a tile asks for: its subject and what it must include. */
export const wishWords = (wish) =>
  words(wish?.shows, ...(Array.isArray(wish?.mustInclude) ? wish.mustInclude : []))

/** The words the vision used for a photo: its caption and the quote of what it depicts. */
export const photoWords = (asset) => words(asset?.caption, asset?.depicts?.evidence?.quote)

/**
 * Best pairs first: every (tile, photo) pair that shares a word, the most shared words first, then the photo the tile
 * already holds, then the tile and photo order given; each tile and each photo in one pair at most.
 * @param {{ id: string, words: Set<string>, holds?: string | null }[]} tiles
 * @param {{ id: string, words: Set<string> }[]} photos
 * @returns {{ tile: string, photo: string, shared: string[] }[]}
 */
export function bestPairs(tiles, photos) {
  const pairs = []
  tiles.forEach((t, ti) =>
    photos.forEach((p, pi) => {
      const shared = [...t.words].filter((w) => p.words.has(w))
      if (shared.length) pairs.push({ tile: t.id, photo: p.id, shared, ti, pi, own: t.holds === p.id })
    })
  )
  pairs.sort(
    (a, b) => b.shared.length - a.shared.length || Number(b.own) - Number(a.own) || a.ti - b.ti || a.pi - b.pi
  )
  const tileTaken = new Set()
  const photoTaken = new Set()
  const out = []
  for (const { tile, photo, shared } of pairs) {
    if (tileTaken.has(tile) || photoTaken.has(photo)) continue
    tileTaken.add(tile)
    photoTaken.add(photo)
    out.push({ tile, photo, shared })
  }
  return out
}

/**
 * Re-place the owner photos of each list's tiles by what the tiles show. Changes `entries`, `usage`, `onPage` and
 * `files` in place.
 * @param {{ idx: object, usable: object[], photoBytes: Map<string, Buffer>, entries: Map<string, object>,
 *   usage: Map<string, number>, onPage: Set<string>, files: Map<string, object>, spare: (a: object) => boolean }} ctx
 *   `spare`: whether a photo no frame took may join (not one a frame waiting for the picker could take)
 */
export async function matchTilesByShows(ctx) {
  const { idx, entries } = ctx
  const groups = new Map()
  for (const [frameId, held] of entries) {
    const tile = idx.galleryTile?.(frameId)
    const e = held.entry
    if (!tile || held.list !== 'frames' || e.source !== 'owner-photo' || !e.asset) continue
    if (wantsDark(idx.frames.get(frameId))) continue
    const key = `${tile.block} ${tile.list}`
    groups.set(key, [...(groups.get(key) ?? []), frameId])
  }
  for (const frameIds of groups.values()) if (frameIds.length >= 2) await matchGroup(ctx, frameIds)
}

async function matchGroup(ctx, frameIds) {
  const { idx, usable, photoBytes, entries, usage, onPage, files, spare } = ctx
  const assetOf = new Map(usable.map((a) => [a.id, a]))
  const holds = new Map(frameIds.map((f) => [f, entries.get(f).entry.asset]))
  const pages = new Set(frameIds.flatMap((f) => [...idx.wishes.get(f).pages]))
  const held = new Set(holds.values())
  const free = usable.filter(
    (a) =>
      !held.has(a.id) &&
      (usage.get(a.id) ?? 0) === 0 &&
      !a.portraitOf &&
      ![...pages].some((p) => onPage.has(`${p} ${a.id}`)) &&
      spare(a)
  )
  const photos = [...[...held].map((id) => assetOf.get(id)).filter(Boolean), ...free]
  const pairs = bestPairs(
    frameIds.map((f) => ({ id: f, words: wishWords(idx.wishes.get(f)), holds: holds.get(f) })),
    photos.map((a) => ({ id: a.id, words: photoWords(a) }))
  )
  if (pairs.every((p) => holds.get(p.tile) === p.photo)) return
  // The cut of a photo for a tile, or null when it does not fit there.
  const cutFor = async (frameId, a) => {
    const wish = idx.wishes.get(frameId)
    const cut = await cutPhoto(photoBytes.get(a.id), a, idx.frames.get(frameId), idx.demoSize(frameId), {
      matches: sameService(a, wish),
      anyReal: true
    })
    return cut.ok ? cut : null
  }
  const plan = new Map()
  const used = new Set()
  for (const p of pairs) {
    const cut = holds.get(p.tile) === p.photo ? 'kept' : await cutFor(p.tile, assetOf.get(p.photo))
    if (!cut) continue
    plan.set(p.tile, { asset: p.photo, cut, shared: p.shared })
    used.add(p.photo)
  }
  // The tiles no pair matched: their own photo when it is still free, else another photo the list held.
  for (const f of frameIds) {
    if (plan.has(f)) continue
    if (!used.has(holds.get(f))) {
      plan.set(f, { asset: holds.get(f), cut: 'kept' })
      used.add(holds.get(f))
      continue
    }
    for (const id of held) {
      if (used.has(id)) continue
      const cut = await cutFor(f, assetOf.get(id))
      if (!cut) continue
      plan.set(f, { asset: id, cut })
      used.add(id)
      break
    }
    // No photo of the list fits this tile any more: the list keeps the placement it had.
    if (!plan.has(f)) return
  }
  for (const f of frameIds) {
    const was = entries.get(f).entry
    const now = plan.get(f)
    if (now.cut === 'kept') continue
    entries.set(f, {
      list: 'frames',
      entry: placedEntry(f, 'owner-photo', now.cut, {
        asset: now.asset,
        reason: now.shared
          ? `any real photo: its description matches what the plan asks this tile to show (${now.shared.join(', ')})`
          : `any real photo of the list, moved here when the others were matched to their tiles`
      })
    })
    files.set(`files/${now.cut.sha256}.${now.cut.ext}`, now.cut)
    if (![...entries.values()].some((h) => h.entry.sha256 === was.sha256)) files.delete(was.file)
  }
  // The photos that left the list and the ones that joined it.
  for (const id of held)
    if (!used.has(id)) {
      usage.set(id, (usage.get(id) ?? 1) - 1)
      for (const p of pages) onPage.delete(`${p} ${id}`)
    }
  for (const id of used)
    if (!held.has(id)) {
      usage.set(id, (usage.get(id) ?? 0) + 1)
      for (const p of pages) onPage.add(`${p} ${id}`)
    }
}
