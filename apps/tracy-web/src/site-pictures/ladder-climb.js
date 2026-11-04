// Climbing the fallback ladder (#344, ADR 0043 section 4): each rung for one frame (ladder-rungs.js says which rungs a
// frame has), on the round's ladder state (ladder-state.js). A rung places a picture (looked at next), ends the frame
// (its row dropped, hidden or returned to the planner), or is skipped with its reason and the next rung is tried.
import { cutPhoto } from './cut-photo.js'
import { darkerFirst } from './darken.js'
import { hiddenEntry, placedEntry } from './frame-entries.js'
import { modeOf, WIDE_BAND } from './ladder-draw.js'
import { anyPhotoRung, reuseRung } from './ladder-reuse.js'
import { fewerRowsRefusal, rowOf, rungsFor } from './ladder-rungs.js'
import { inParallel } from './looker-step.js'
import { rankForFrame, sameService } from './photo-shortlist.js'

export const DRAW_CONCURRENCY = 4
/** How many other owner photos the "next photo" rung places for one frame before it gives up. */
export const NEXT_PHOTO_TRIES = 2
/** The rungs a frame stays on after a placement: the looker's rejection is followed by the rung's next photo. */
const STAYS = new Set(['next-photo', 'reuse', 'any-photo'])

// The picture of a frame for its drawing rungs: a wide band is extended from a portrait owner photo of its own offering
// that no other frame on its pages shows; any other frame is drawn.
function chooseMode({ idx, usable }, s, frameId, p) {
  if (p.mode) return
  const frame = idx.frames.get(frameId)
  // A cut-out is drawn on a plain ground (cutout-ground.js), never extended from a photo.
  if (frame?.kind === 'cutout') {
    p.mode = 'cutout'
    p.asset = null
    return
  }
  const wish = idx.wishes.get(frameId)
  const shape = idx.demoSize(frameId) ?? frame
  const used = s.onPages(frameId)
  const photo =
    shape.width / shape.height >= WIDE_BAND
      ? usable.find(
          (a) =>
            sameService(a, wish) &&
            !a.portraitOf &&
            Number(a.height) > Number(a.width) &&
            !used.has(a.id) &&
            !p.tried.has(a.id)
        )
      : null
  p.mode = photo ? 'outpaint' : modeOf(frame)
  p.asset = photo ?? null
}

async function drawRung(ctx, s, frameId, p, rung) {
  const { idx, drawing } = ctx
  if (!drawing) return { skip: 'the run has no drawer door' }
  chooseMode(ctx, s, frameId, p)
  const frame = idx.frames.get(frameId)
  const attempt = rung === 'redraw' ? 2 : 1
  const ask = () =>
    drawing.draw({
      frameId,
      wish: idx.wishes.get(frameId),
      frame,
      demo: idx.demoSize(frameId),
      mode: p.mode,
      asset: p.asset,
      faults: rung === 'redraw' ? p.faults : null,
      attempt
    })
  let res = await ask()
  if (!res.made && !res.call && p.mode === 'outpaint') {
    // The photo cannot be extended to this band without growing: drawn as a whole instead.
    s.note(frameId, rung, 'skipped', `extend ${p.asset.id}: ${res.problem}`)
    p.mode = modeOf(frame)
    p.asset = null
    res = await ask()
  }
  if (res.call) s.draws.push(res.call)
  // A cut-out whose ground could not be removed: the redraw is told the fault, as after a rejection.
  if (!res.made && res.faults?.length) p.faults = res.faults
  if (!res.made) return { skip: res.problem }
  s.keepFile(res.made, res.call.cached ? 0 : (res.call.costUsd ?? 0))
  if (res.backdropFile) s.keepFile(res.backdropFile, 0)
  const extended = p.mode === 'outpaint'
  const list = s.listOf(frame)
  const cut = res.extra.cutout
  const reason = extended
    ? `owner photo ${p.asset.id} extended sideways to fill the wide band`
    : cut
      ? `drawn as a cut-out on a plain ${cut.groundName} ground (${cut.ground}), the ground removed by code: no owner photo is cut out`
      : `drawn (${p.mode}): no owner photo fits`
  return {
    list,
    entry: placedEntry(frameId, extended ? 'owner-photo-extended' : 'drawn', res.made, {
      ...res.extra,
      drawing: { mode: p.mode, attempt },
      reason,
      ...s.extraOf(list)
    })
  }
}

async function nextPhotoRung({ idx, usable, photoBytes, store, luminance }, s, frameId, p) {
  if (p.photos >= NEXT_PHOTO_TRIES) return { skip: `${NEXT_PHOTO_TRIES} other photos tried` }
  const wish = idx.wishes.get(frameId)
  const frame = idx.frames.get(frameId)
  const used = s.onPages(frameId)
  const ranked = await darkerFirst(
    rankForFrame(usable, wish, frame, s.usageNow()).map((r) => r.a),
    frame,
    photoBytes,
    luminance
  )
  const tried = []
  for (const a of ranked) {
    if (p.tried.has(a.id) || used.has(a.id)) continue
    p.tried.add(a.id)
    const cut = await cutPhoto(photoBytes.get(a.id), a, frame, idx.demoSize(frameId), {
      matches: sameService(a, wish),
      anyReal: wish.match === 'any-real'
    })
    if (!cut.ok) {
      tried.push(`${a.id} ${cut.refused}`)
      continue
    }
    p.photos += 1
    const name = await store.putPicture(cut.bytes, cut.ext)
    s.keepFile({ ...cut, sha256: name.split('.')[0] })
    const list = s.listOf(frame)
    return {
      list,
      entry: placedEntry(frameId, 'owner-photo', cut, {
        asset: a.id,
        reason: `the next owner photo, after: ${s.story(frameId)}`,
        ...s.extraOf(list)
      })
    }
  }
  return { skip: `no other owner photo fits${tried.length ? ` (tried ${tried.join(', ')})` : ''}` }
}

function fewerRowsRung({ idx, plan, kit }, s, frameId) {
  const row = rowOf(plan, frameId)
  if (!row) return { skip: 'not in a list row' }
  const key = `${row.block} ${row.list}`
  const now = s.rowsNow.get(key) ?? row.rows
  const refused = fewerRowsRefusal(kit, row, now)
  if (refused) return { skip: refused }
  const frames = row.frames.filter((f) => !s.isTwin(f))
  const stuck = frames.find(
    (f) => idx.frames.get(f)?.canHide !== true || s.listOf(idx.frames.get(f)) !== 'frames'
  )
  if (stuck) return { skip: `frame ${stuck} of the row cannot be hidden` }
  s.rowsNow.set(key, now - 1)
  const reason = `fewer rows: ${row.list} shows ${now - 1} rows instead of ${now}, without the row of ${frameId}`
  for (const f of frames) {
    s.entries.set(f, { list: 'frames', entry: hiddenEntry(f, `${reason}; ${s.story(frameId)}`) })
    s.pending = s.pending.filter((x) => x.frame !== f)
    s.progress.set(f, { ...s.progress.get(f), done: true })
  }
  s.rows.push({ block: row.block, list: row.list, rows: now - 1, from: now, dropped: frames, reason })
  return { done: true }
}

function hideRung({ idx }, s, frameId) {
  const frame = idx.frames.get(frameId)
  return frame?.canHide === true && s.listOf(frame) === 'frames'
    ? { hide: true }
    : { skip: 'the kit does not let this frame be hidden' }
}

/** Run one rung for a frame. */
function runRung(ctx, s, frameId, p, rung) {
  if (rung === 'draw' || rung === 'redraw') return drawRung(ctx, s, frameId, p, rung)
  if (rung === 'next-photo') return nextPhotoRung(ctx, s, frameId, p)
  if (rung === 'fewer-rows') return fewerRowsRung(ctx, s, frameId)
  if (rung === 'hide') return hideRung(ctx, s, frameId)
  if (rung === 'reuse') return reuseRung(ctx, s, frameId, p)
  if (rung === 'any-photo') return anyPhotoRung(ctx, s, frameId, p)
  return { ret: true }
}

// Climb a frame's ladder from where it stands until a rung places a picture or ends the frame.
async function climb(ctx, s, frameId, firstResult = null) {
  const p = s.progress.get(frameId)
  const rungs = rungsFor(ctx.idx, frameId)
  let result = firstResult
  for (;;) {
    if (p.done) return
    const rung = rungs[p.at]
    result ??= await runRung(ctx, s, frameId, p, rung)
    if (result.entry) {
      s.entries.set(frameId, { list: result.list, entry: result.entry })
      s.note(frameId, rung, 'placed', result.entry.sha256.slice(0, 12))
      p.last = rung
      // The photo rungs stay where they are: a rejected photo is followed by another, up to their tries.
      if (!STAYS.has(rung)) p.at += 1
      return
    }
    if (result.done) return s.note(frameId, rung, 'done')
    if (result.hide || result.ret) {
      s.note(frameId, rung, result.hide ? 'hidden' : 'returned')
      if (result.hide)
        s.entries.set(frameId, {
          list: 'frames',
          entry: hiddenEntry(frameId, `hidden after: ${s.story(frameId)}`)
        })
      else {
        s.entries.delete(frameId)
        s.returns.push({
          frame: frameId,
          reason: ctx.idx.galleryTile?.(frameId)
            ? `a gallery tile is never hidden alone, and no owner photo is left for it after: ${s.story(frameId)}`
            : `no picture is left for this frame after: ${s.story(frameId)}`
        })
      }
      p.done = true
      return
    }
    s.note(frameId, rung, 'skipped', result.skip)
    p.at += 1
    result = null
  }
}

/**
 * Climb several frames one rung on: their drawing rungs at once (DRAW_CONCURRENCY at a time), every other rung one by
 * one, so two frames never take the same photo for one page.
 * @param {{ idx: object, plan: object, kit: object, usable: object[], photoBytes: Map<string, Buffer>, store: object,
 *   drawing: { draw: Function } | null, luminance: Map<string, number> }} ctx
 */
export async function climbAll(ctx, s, frameIds) {
  const rungOf = (f) => rungsFor(ctx.idx, f)[s.progress.get(f).at]
  const drawsFirst = frameIds.filter((f) => ['draw', 'redraw'].includes(rungOf(f)))
  const drawn = await inParallel(drawsFirst, DRAW_CONCURRENCY, (f) =>
    drawRung(ctx, s, f, s.progress.get(f), rungOf(f))
  )
  const first = new Map(drawsFirst.map((f, i) => [f, drawn[i]]))
  for (const f of frameIds) await climb(ctx, s, f, first.get(f) ?? null)
}
