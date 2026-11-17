// Finishing the placed pictures of a draft run (#575 pictures gap audit, ports 1 and 5), in the step chain's order
// (`site-pictures/ladder-step.js`): the placed owner photos are looked at, the frames still waiting are drawn, every
// drawing is looked at, and each picture keeps the alt text the look wrote in the site's language.
//
//   own photos   each placed owner photo is cut to its frame as the write cuts it (`cutPhoto`, the research labels)
//                and looked at (`step-chain-draft-look.js`). A photo rejected for a hard fault leaves its frames and
//                the placement runs again without it (`placeAgainWithout`, the step chain's "next photo" rung), at
//                most `NEXT_PHOTO_TRIES` rounds; a photo rejected for minor faults only stays (`onlyMinorFaults`)
//   drawings     the frames the placement marks `generated` (not a reuse, not a pair's variant) get the build model's
//                wishes in one call (`picture-wishes.mjs`), then the drawer (`step-chain-draft-drawer.js`). A drawn
//                frame names its stored drawing (`file: drawn:<id>`), and so does every frame that reuses it; a frame
//                no rung fills, and its reuses, stay empty (`drawing_rejected`)
//
// 🔒 NO DRAWER, NO BUILD THAT NEEDS ONE. A frame that waits for a drawing with no drawer door wired stops the step
// typed (`picture_drawer_missing`, never re-run), as the step chain refuses such a run at its start.
import { pictureWishes } from 'website-opportunities/domain/picture-wishes.mjs'
import { placeAgainWithout, talliesOf } from 'website-opportunities/domain/picture-step.mjs'
import { cutPhoto } from './site-pictures/cut-photo.js'
import { NEXT_PHOTO_TRIES } from './site-pictures/ladder-climb.js'
import { onlyMinorFaults } from './site-pictures/looker-call.js'
import { inParallel, LOOK_CONCURRENCY } from './site-pictures/looker-step.js'
import { createDraftDrawer } from './step-chain-draft-drawer.js'
import { lookAt } from './step-chain-draft-look.js'
import { draftError } from './step-chain-draft-source.js'

export const DRAWN = 'drawn:'
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const sized = (f) => f?.size?.width > 0 && f?.size?.height > 0

/** The frames whose own photo is looked at: a placed photo (not a video, not a pair's variant) in a sized frame. */
const ownToLook = (frames, seen) =>
  frames.filter((f) => f.source === 'own' && !f.sameAs && sized(f) && f.place !== 'video' && !seen.has(f.id))

/** The counts of the frames as the placement counts them (`picture-policy.mjs`). */
function countsOf(frames, before) {
  const counts = { ...before, own: 0, generated: 0, initials: 0, none: 0, variants: 0, reused: 0 }
  for (const f of frames) counts[f.sameAs ? 'variants' : f.reuses ? 'reused' : f.source] += 1
  return counts
}

/**
 * @param {{placed: object, plan: object, profile: object, kit: {blockStore: object, library: object[]},
 *   bytes: Map<string, Uint8Array>, labels: Map<string, object>, model: Function, drawer: object | null,
 *   drawn: object | null, accountId: string | null, altOf: (frame: object) => object | null, wait?: Function}} input `placed`: `placeBuildPictures`; `bytes` the opened bytes by address; `drawer` the drawer
 *   door (`{door}`) or null; `drawn` the store of drawings
 * @returns {Promise<object>} `placed` with its frames finished, `looks` and `drawing` for the record
 */
export async function finishPictures(input) {
  const { plan, profile, kit, bytes, labels, model, altOf } = input
  // The labelled own pictures ride along from here (`placeBuildPictures` keeps them out of its enumerable output).
  let placed = { ...input.placed, pictures: input.placed.pictures ?? [] }
  const looked = new Map()
  const record = { looked: 0, rejected: [], calls: 0 }
  for (let round = 0; round <= NEXT_PHOTO_TRIES; round++) {
    const todo = ownToLook(placed.frames, looked)
    if (!todo.length) break
    const rejected = new Set()
    await inParallel(todo, LOOK_CONCURRENCY, async (frame) => {
      const got = bytes.get(frame.ref)
      if (!got) return
      const cut = await cutPhoto(got, labels.get(frame.ref) ?? {}, frame.size, frame.size).catch(() => ({
        ok: false
      }))
      const look = await lookAt({
        model,
        bytes: cut.ok ? cut.bytes : got,
        size: frame.size,
        frame,
        alt: altOf(frame)
      })
      record.calls += look.calls
      // A picture that cannot be shown is not looked at: the write uploads it as stored and flags it (`slot_picture_unread`).
      if (look.verdict === null) return
      record.looked += 1
      looked.set(frame.id, look)
      if (look.verdict === 'fail' && !onlyMinorFaults(look.faults)) rejected.add(frame.picture)
    })
    if (!rejected.size || round === NEXT_PHOTO_TRIES) break
    record.rejected.push(...rejected)
    placed = placeAgainWithout({ plan, profile, ...kit, placed, without: rejected })
    for (const f of placed.frames) if (f.source !== 'own') looked.delete(f.id)
  }
  // A pair's variant shows its base's photo: it takes the base's alt.
  const frames = placed.frames.map((f) => {
    const look = f.source === 'own' ? looked.get(f.sameAs ?? f.id) : null
    return look?.alt ? { ...f, lookAlt: look.alt } : f
  })
  return drawFrames({ ...input, placed: { ...placed, frames }, ownLooks: record })
}

async function drawFrames({ placed, plan, profile, model, drawer, drawn, accountId, altOf, wait, ownLooks }) {
  const waiting = placed.frames.filter((f) => f.source === 'generated' && !f.reuses && !f.sameAs)
  if (!waiting.length) return { ...placed, looks: ownLooks, drawing: null }
  if (!drawer?.door || !drawn)
    throw draftError('picture_drawer_missing', 'a frame waits for a drawing and no picture drawer is wired', {
      frames: waiting.map((f) => f.id),
      ...(drawer?.refused ? { refused: drawer.refused } : {})
    })
  const { wishes, prompt } = await pictureWishes({ frames: waiting, profile, model })
  const run = createDraftDrawer({
    door: drawer.door,
    drawn,
    model,
    accountId,
    ...(drawer.fetchImpl ? { fetchImpl: drawer.fetchImpl } : {}),
    ...(wait ? { wait } : {})
  })
  const results = await run.drawAll(
    waiting.map((frame) => ({ frame, wish: wishes.get(frame.id) })),
    altOf
  )
  const byFrame = new Map(waiting.map((f, i) => [f.id, results[i]]))
  const frames = placed.frames.map((f) => {
    if (f.source !== 'generated' || f.sameAs) return f
    const got = byFrame.get(f.reuses ?? f.id)
    if (!got?.picture) {
      const { generate: _g, reuses: _r, ...rest } = f
      return { ...rest, source: 'none', reason: 'drawing_rejected' }
    }
    return {
      ...f,
      file: `${DRAWN}${got.picture.id}`,
      fileMime: got.picture.mime,
      ...(isText(got.look?.alt) ? { lookAlt: got.look.alt } : {})
    }
  })
  // A pair's variant follows its base: drawn when the base is, empty when it is not.
  const byId = new Map(frames.map((f) => [f.id, f]))
  const settled = frames.map((f) => {
    const base = f.sameAs && f.source === 'generated' ? byId.get(f.sameAs) : null
    if (!base) return f
    if (base.source === 'none') return { ...f, source: 'none', reason: 'drawing_rejected' }
    return isText(base.lookAlt) ? { ...f, lookAlt: base.lookAlt } : f
  })
  const assignment = { ...placed, frames: settled, counts: countsOf(settled, placed.counts) }
  return {
    ...assignment,
    ...talliesOf(assignment, plan.pictures ?? {}, placed.pictures),
    looks: ownLooks,
    drawing: {
      model: drawer.door.model,
      snapshot: drawer.snapshot ?? null,
      wishesPrompt: prompt,
      frames: waiting.map((f) => ({ frame: f.id, rungs: byFrame.get(f.id)?.rungs ?? [] })),
      spend: run.spend
    }
  }
}

/** Whether a stored id names a drawing (`stored(order)` of `step-chain-draft-stored.js`). */
export const isDrawnFile = (file) => isText(file) && file.startsWith(DRAWN)
