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
// A photo may show again in the tile's own block only in a clearly different cut: the reuse cut shares at most
// REUSE_MAX_OVERLAP and the any-photo cut at most ANY_PHOTO_MAX_OVERLAP with every other cut of the photo on its pages
// (owner decision 06/11/2026, card AK: two tiles of one gallery showed the same scene, cuts sharing 97%). With no such
// cut left, the tile goes to the draw rung.

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
  const tried = []
  for (const { a } of rankForFrame(usable, wish, frame, s.usageFor(frameId))) {
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

/**
 * The any-photo rung's next owner photo for a frame and its cut, in the rung's own order, skipping the photos in
 * `filled` (and adding each photo it considers to it): null when none is left. `tried` collects why photos were passed
 * over. Shared by the rung and by its look-ahead (anyPhotoAhead), so both pick the same photos the same way.
 */
async function nextAnyPhoto({ idx, usable, photoBytes }, s, frameId, filled, tried) {
  const tile = idx.galleryTile(frameId)
  const wish = idx.wishes.get(frameId)
  const frame = idx.frames.get(frameId)
  const cuts = s.cutsOn(frameId)
  for (const { a } of rankForFrame(usable, wish, frame, s.usageFor(frameId))) {
    if (filled.has(a.id)) continue
    filled.add(a.id)
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
    return { a, cut, uses, frame }
  }
  return null
}

export async function anyPhotoRung(ctx, s, frameId, p) {
  if (ctx.usable.length < ANY_PHOTO_MIN)
    return { skip: `the brief has fewer than ${ANY_PHOTO_MIN} usable owner photos` }
  p.filled ??= new Set()
  const tried = []
  const next = await nextAnyPhoto(ctx, s, frameId, p.filled, tried)
  if (!next) return { skip: `every usable owner photo tried${tried.length ? ` (${tried.join(', ')})` : ''}` }
  const { a, cut, uses, frame } = next
  const name = await ctx.store.putPicture(cut.bytes, cut.ext)
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

/**
 * The pictures the any-photo rung would place next for a frame if the looker rejected each one, at most `count`, in
 * order, as `{ list, entry }`: the same photos and the same cuts (nextAnyPhoto), written to the store so the looker can
 * read them, but nothing changes in the frame's progress or the round's state. The ladder looks at them at once
 * (ladder-step.js looksAhead), so the passes that place them find their look already taken. A photo another frame takes
 * in between gets another cut, and that cut is looked at when it is placed.
 */
export async function anyPhotoAhead(ctx, s, frameId, p, count) {
  if (ctx.usable.length < ANY_PHOTO_MIN || count < 1) return []
  const filled = new Set(p.filled ?? [])
  const out = []
  while (out.length < count) {
    const next = await nextAnyPhoto(ctx, s, frameId, filled, [])
    if (!next) break
    await ctx.store.putPicture(next.cut.bytes, next.cut.ext)
    out.push({
      list: s.listOf(next.frame),
      entry: placedEntry(frameId, 'owner-photo', next.cut, { asset: next.a.id })
    })
  }
  return out
}
