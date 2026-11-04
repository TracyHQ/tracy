// The "reuse" rung of a gallery tile's ladder (gallery-tiles.js, ADR 0043 section 4): an owner photo already shown on
// the tile's page, never one shown in a neighbouring tile of the same list, cut again clear of its other cuts
// (reuse-crop.js) and looked at like any picture. At most REUSE_TRIES placements per tile, then the rung is skipped
// (and the tile returned to the planner). Never drawn: an any-real tile stays real.

import { placedEntry } from './frame-entries.js'
import { neighbours } from './gallery-tiles.js'
import { rankForFrame, sameService } from './photo-shortlist.js'
import { cutPhotoAway } from './reuse-crop.js'

/** How many reused photos the rung places for one tile before it gives up. */
export const REUSE_TRIES = 2

export async function reuseRung({ idx, usable, photoBytes, store }, s, frameId, p) {
  p.reused ??= new Set()
  if (p.reuses >= REUSE_TRIES) return { skip: `${REUSE_TRIES} reused photos tried` }
  const tile = idx.galleryTile(frameId)
  const wish = idx.wishes.get(frameId)
  const frame = idx.frames.get(frameId)
  const cuts = s.cutsOn(frameId)
  const tried = []
  for (const { a } of rankForFrame(usable, wish, frame, s.usageNow())) {
    const uses = cuts.get(a.id)
    if (!uses || p.reused.has(a.id)) continue
    p.reused.add(a.id)
    const near = uses.find((u) => neighbours(tile, idx.gallery(u.frame)))
    if (near) {
      tried.push(`${a.id} is in the neighbouring tile ${near.frame}`)
      continue
    }
    // A use with no recorded cut cannot be kept clear of: that photo is not reused.
    if (uses.some((u) => !u.crop)) {
      tried.push(`${a.id} has a use with no recorded cut`)
      continue
    }
    const avoid = uses.map((u) => u.crop)
    const cut = await cutPhotoAway(photoBytes.get(a.id), a, frame, idx.demoSize(frameId), avoid)
    if (!cut.ok) {
      tried.push(`${a.id} ${cut.refused}`)
      continue
    }
    p.reuses = (p.reuses ?? 0) + 1
    const name = await store.putPicture(cut.bytes, cut.ext)
    s.keepFile({ ...cut, sha256: name.split('.')[0] })
    const also = uses.map((u) => u.frame)
    const list = s.listOf(frame)
    return {
      list,
      entry: placedEntry(frameId, 'owner-photo', cut, {
        asset: a.id,
        reuse: { with: also, overlap: cut.overlap },
        ...s.extraOf(list),
        reason: `reused owner photo ${a.id}${sameService(a, wish) ? ' (shows this offering)' : ''}, also in ${also.join(', ')}, cut to another region (at most ${Math.round(cut.overlap * 100)}% shared): a gallery tile is never hidden alone; after: ${s.story(frameId)}`
      })
    }
  }
  return {
    skip: `no owner photo on the page can be reused${tried.length ? ` (tried ${tried.join(', ')})` : ''}`
  }
}
