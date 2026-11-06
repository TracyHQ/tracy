// The "reuse" rung of a gallery tile's ladder (gallery-tiles.js, ADR 0043 section 4): an owner photo already shown on
// the tile's page, never one shown in a neighbouring tile of the same list, cut again clear of its other cuts
// (reuse-crop.js) and looked at like any picture. At most REUSE_TRIES placements per tile, then the rung is skipped
// (and the next rung tried). Never drawn: an any-real tile stays real.
//
// The "any-photo" rung after it always fills while the brief has at least ANY_PHOTO_MIN usable owner photos (owner
// decision 04/11/2026): any usable owner photo, used on other pages or already twice, any region, keeping only the hard
// rules: heads whole, never the photo of a neighbouring tile, never the very cut another frame of the page shows. The
// looker still looks; a rejected picture is followed by the next photo, until every photo is tried.
//
// Neither rung ever shows one owner photo twice in one kit block, and an any-photo cut shares at most
// ANY_PHOTO_MAX_OVERLAP with another cut of the photo on its pages (owner decision 06/11/2026, card AK: two tiles of
// one gallery showed the same scene, cuts sharing 97%). With nothing left, the tile goes to the draw rung.

import { placedEntry } from './frame-entries.js'
import { ANY_PHOTO_MAX_OVERLAP, neighbours } from './gallery-tiles.js'
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
  const inBlock = s.inBlock(frameId)
  const tried = []
  for (const { a } of rankForFrame(usable, wish, frame, s.usageNow())) {
    const uses = cuts.get(a.id)
    if (!uses || p.reused.has(a.id)) continue
    p.reused.add(a.id)
    if (inBlock.has(a.id)) {
      tried.push(`${a.id} is already in ${frame.blockId} (${inBlock.get(a.id)})`)
      continue
    }
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
        reuse: { rung: 'reuse', with: also, overlap: cut.overlap },
        ...s.extraOf(list),
        reason: `reused owner photo ${a.id}${sameService(a, wish) ? ' (shows this offering)' : ''}, also in ${also.join(', ')}, cut to another region (at most ${Math.round(cut.overlap * 100)}% shared): a gallery tile is never hidden alone; after: ${s.story(frameId)}`
      })
    }
  }
  return {
    skip: `no owner photo on the page can be reused${tried.length ? ` (tried ${tried.join(', ')})` : ''}`
  }
}

/** Below this many usable owner photos, the any-photo rung does not fill and the tile is returned. */
export const ANY_PHOTO_MIN = 2

export async function anyPhotoRung({ idx, usable, photoBytes, store }, s, frameId, p) {
  if (usable.length < ANY_PHOTO_MIN)
    return { skip: `the brief has fewer than ${ANY_PHOTO_MIN} usable owner photos` }
  p.filled ??= new Set()
  const tile = idx.galleryTile(frameId)
  const wish = idx.wishes.get(frameId)
  const frame = idx.frames.get(frameId)
  const cuts = s.cutsOn(frameId)
  const inBlock = s.inBlock(frameId)
  const tried = []
  for (const { a } of rankForFrame(usable, wish, frame, s.usageNow())) {
    if (p.filled.has(a.id)) continue
    p.filled.add(a.id)
    if (inBlock.has(a.id)) {
      tried.push(`${a.id} is already in ${frame.blockId} (${inBlock.get(a.id)})`)
      continue
    }
    const uses = cuts.get(a.id) ?? []
    const near = uses.find((u) => neighbours(tile, idx.gallery(u.frame)))
    if (near) {
      tried.push(`${a.id} is in the neighbouring tile ${near.frame}`)
      continue
    }
    const avoid = uses.map((u) => u.crop).filter(Boolean)
    const cut = await cutPhotoAway(photoBytes.get(a.id), a, frame, idx.demoSize(frameId), avoid, {
      maxOverlap: ANY_PHOTO_MAX_OVERLAP,
      distinct: true
    })
    if (!cut.ok) {
      tried.push(`${a.id} ${cut.refused}`)
      continue
    }
    const name = await store.putPicture(cut.bytes, cut.ext)
    s.keepFile({ ...cut, sha256: name.split('.')[0] })
    const also = uses.map((u) => u.frame)
    const list = s.listOf(frame)
    return {
      list,
      entry: placedEntry(frameId, 'owner-photo', cut, {
        asset: a.id,
        reuse: { rung: 'any-photo', with: also, overlap: cut.overlap },
        ...s.extraOf(list),
        reason: `owner photo ${a.id}${also.length ? `, also in ${also.join(', ')} on this page, cut another way` : ''}: a gallery tile is never hidden alone and no clearly different cut was left; after: ${s.story(frameId)}`
      })
    }
  }
  return { skip: `every usable owner photo tried${tried.length ? ` (${tried.join(', ')})` : ''}` }
}
