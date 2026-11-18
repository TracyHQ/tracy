// Finishing a checked round of the picture step (#344, ADR 0043 sections 3 and 4): the drawer, the dark overlays, the
// looker and the fallback ladder, in that order for each frame, on the manifest the picker and code made.
//
// 1. Every frame that waits for the drawer (a `specific` frame no owner photo fits, or that the picker answered "none")
//    is drawn, at most DRAW_CONCURRENCY at a time: a wide band with a portrait owner photo of the frame's own offering
//    is extended from it (`owner-photo-extended`), any other frame drawn as a scene or an object (`drawn`). An
//    `any-real` or `person` frame is never drawn or extended. Every cut-out frame (#346) starts its own ladder too: a
//    `specific` one is drawn on a plain ground whose colour code removes (cutout-ground.js), any other is hidden or
//    returned at once (never a demo figure, never an owner photo cut out).
// 2. A picture in a frame with text over it that is still too bright gets a dark overlay baked in (darken.js).
// 3. The looker looks at every finished picture (looker-step.js), at most LOOK_CONCURRENCY at a time.
// 4. Each rejected frame climbs its ladder (ladder-rungs.js): draw, one redraw with the fault names, the next photo,
//    fewer rows (where the kit allows), hidden (where the kit allows), drawn again in other compositions, the best
//    picture rejected for minor faults only kept, and only then returned to the planner. A gallery tile is never
//    hidden alone: after fewer rows it reuses an owner photo of its page cut to another region (ladder-reuse.js), and a
//    gallery tile code found no photo for waits for this ladder. After each rung the
//    changed picture is looked at again. A frame the picker placed climbs only in the last round (and then also when
//    it still fails the picture check): before it, the picker gets it back with its fault names. A look that could not
//    be read is no rejection: the picture fails L01 and the next round asks again.
//
// Each frame goes through these steps on its own (frameTask): as soon as the look of its picture comes back, a rejected
// frame takes its next rung, while other frames still wait for theirs. Before 16/11/2026 every frame climbed one rung
// per pass and each pass waited for every look of the manifest: on dev (BXR London) the ladder of round 0 took 155
// looks in 405 s, where eight looks in flight at about 7 s each needed about 140 s. The frames share the round's state:
// every rung runs in one lock, one rung of one frame at a time (ladder-climb.js climbFrame), and every other change a
// frame's task makes to its own entry is checked and written with no wait in between. The manifest's lists are written
// in a fixed frame order, whatever order the frames finished in.
//
// The rungs are in ladder-climb.js, the round's state in ladder-state.js. Each rung a frame took is recorded in the
// manifest's `ladder` ({ frame, steps: [{ rung, outcome, detail }] }) and its entry's reason; dropped rows in `rows`;
// every drawing in `drawer` (the door's model and snapshot, the template hash, how many pictures are drawn or extended,
// one record per call) with `cost.drawer` and `timing.drawer`. `paid` is what this save spent (drawings and looks not
// cached), which the caller adds to the run's cost; `files` the files it made.
import path from 'node:path'
import { darkenPicture, wantsDark } from './darken.js'
import { WAITS_FOR } from './fill-frames.js'
import { fileFields } from './frame-entries.js'
import { climbFrame, DRAW_CONCURRENCY, NEXT_PHOTO_TRIES, REDRAW_ALT_TRIES } from './ladder-climb.js'
import { anyPhotoAhead } from './ladder-reuse.js'
import { rungsFor } from './ladder-rungs.js'
import { ladderState } from './ladder-state.js'
import { LOOK_UNREADABLE, TEXT_OVER_FAULT } from './looker-call.js'
import { limiter, LOOK_CONCURRENCY, LOOKED_SOURCES } from './looker-step.js'
import { OWNER_SOURCES } from './manifest-shape.js'
import { WAITS_FOR_DRAWER } from './picker-picks.js'
import { PICTURE_PROCESSING_POLICY } from './picture-prompts.js'

export { DRAW_CONCURRENCY, NEXT_PHOTO_TRIES, REDRAW_ALT_TRIES }

/**
 * How many times one frame climbs after a rejection in a round (each climb places one picture, looked at once). A
 * gallery tile's any-photo rung may try every owner photo of the brief, one look each.
 */
const MAX_PASSES = 40
/**
 * How many of its next photos a frame on the any-photo rung has looked at together, when the look of its next one is
 * not taken yet (finish lookAheadFor). One look is about 10 s, up to 50 s on the local stand (12/11/2026), and a
 * Central Padel build spent 40 looks of one tile's ladder there: 19 minutes. Looked at three at a time, two placements
 * in three find their look taken or under way. The photos, their order and their verdicts do not change; a photo looked
 * at ahead and never placed costs its look (about $0.0003).
 */
export const LOOK_AHEAD = 3

/**
 * How many next photos a frame on the any-photo rung has looked at together, while `frames` frames still climb:
 * LOOK_AHEAD, or more when so few frames climb that their looks would leave the looker's `budget` (LOOK_CONCURRENCY
 * looks in flight) idle. On dev (BXR London, 16/11/2026) frames on this rung tried 14 to 17 photos each, three looks at
 * a time; once only a few of them were left, the looker answered about one look every four seconds with eight allowed
 * in flight, and the ladder of the first fix round took 77 looks and 5 minutes. With one frame left its next eight
 * photos are looked at in one wave. As with LOOK_AHEAD, the photos, their order and their verdicts do not change; a
 * photo looked at ahead and never placed costs its look.
 * @param {number} frames how many frames still climb
 * @param {number} least the depth with many frames (LOOK_AHEAD)
 * @param {number} budget the looks the looker has in flight at once (LOOK_CONCURRENCY)
 */
export function aheadDepth(frames, least, budget) {
  return Math.max(least, Math.ceil(budget / Math.max(1, frames)))
}
const NOT_DRAWN_KINDS = new Set(['icon', 'logo'])
const DRAWN_SOURCES = new Set(['drawn', 'owner-photo-extended'])

const sum = (list, key) => list.reduce((n, c) => n + (Number.isFinite(c[key]) ? c[key] : 0), 0)
const counted = (list) => list.filter((e) => DRAWN_SOURCES.has(e.source)).length

/**
 * `list` in the order of its frames in `order` (the first place of a frame counts; a frame not in it comes last), each
 * frame's own items in the order they came. The frames climb side by side, so the order they finish in is not the
 * order the manifest writes them in.
 */
function inFrameOrder(list, frameOf, order) {
  const rank = new Map()
  for (const f of order) if (!rank.has(f)) rank.set(f, rank.size)
  const at = (x) => rank.get(frameOf(x)) ?? rank.size
  return list
    .map((x, i) => [x, i])
    .sort(([a, i], [b, j]) => at(a) - at(b) || i - j)
    .map(([x]) => x)
}

/**
 * One at a time, for every frame of a round: `lock(frame, fn)` runs `fn` once the lock is free. When it frees, the
 * waiting frame first in `order` goes next, so frames that ask while another frame holds it are served in frame order
 * (a frame waits for one thing at a time, so its own asks keep their order).
 */
function frameLock(order) {
  const rank = new Map(order.map((f, i) => [f, i]))
  const at = (f) => rank.get(f) ?? rank.size
  const waiting = []
  let busy = false
  const next = () => {
    if (busy || !waiting.length) return
    let first = 0
    for (let i = 1; i < waiting.length; i++) if (at(waiting[i].frame) < at(waiting[first].frame)) first = i
    const [{ fn, resolve, reject }] = waiting.splice(first, 1)
    busy = true
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        busy = false
        next()
      })
  }
  return (frame, fn) =>
    new Promise((resolve, reject) => {
      waiting.push({ frame, fn, resolve, reject })
      next()
    })
}

/**
 * The finisher of one run.
 * @param {{ idx: object, plan: object, kit: object, usable: object[], photoBytes: Map<string, Buffer>,
 *   store: ReturnType<import('./file-store.js').fileStore>, looker: { look: Function, known?: Function, ahead?: Function },
 *   drawing: { draw: Function } | null, drawer: { model: string | null, snapshot: object | null, promptSha256: string } }} input
 *   `drawing` ladder-draw.js createDrawing, or null when the run has no drawer door; `lookAhead` LOOK_AHEAD (0 turns
 *   the look-ahead off); `lookBudget` the looks one wave of look-ahead fills (aheadDepth), LOOK_CONCURRENCY. The bound
 *   on looks in flight is the looker's own (looker-step.js createLooker `concurrency`).
 */
export function createFinisher({
  idx,
  plan,
  kit,
  usable,
  photoBytes,
  store,
  looker,
  drawing,
  drawer,
  lookAhead = LOOK_AHEAD,
  lookBudget = LOOK_CONCURRENCY
}) {
  // Drawings in flight at once, whichever frames ask for them.
  const drawSlots = limiter(DRAW_CONCURRENCY)
  const ctx = {
    idx,
    plan,
    kit,
    usable,
    photoBytes,
    store,
    drawing: drawing ? { ...drawing, draw: (ask) => drawSlots(() => drawing.draw(ask)) } : null,
    luminance: new Map()
  }
  const climbable = (frameId) => {
    const frame = idx.frames.get(frameId)
    return Boolean(idx.wishes.get(frameId)) && Boolean(frame) && !NOT_DRAWN_KINDS.has(frame.kind)
  }

  /**
   * @param {object} doc the round's manifest
   * @param {{ lastRound: boolean, failing?: Map<string, string[]> }} round `lastRound`: no picker round follows this
   *   one; `failing`: the rule ids each frame failed in the round's picture check (a frame the picker placed that still
   *   fails in the last round climbs the ladder as a rejected one does)
   * @returns {Promise<{ doc: object, rule: object, paid: number, files: object[] }>}
   */
  async function finish(doc, { lastRound, failing = new Map() }) {
    const s = ladderState(idx, doc)
    const looks = new Map()
    const memo = new Map()
    const darkChecked = new Set()
    let paidLooks = 0
    // Persist source and output hashes so a later round cannot retry the same candidate. Crash replay produces the
    // same bytes and therefore reuses the looker's per-run disk cache, including the independent transformed look.
    const readabilityRetries = [...(doc.readabilityRetries ?? [])]
    const earlierRetries = readabilityRetries.length
    const retried = new Set(
      readabilityRetries.flatMap((r) => [`${r.frame} ${r.sourceSha256}`, `${r.frame} ${r.sha256}`])
    )
    // One rung of one frame at a time (ladder-climb.js climbFrame); the look-ahead chooses its photos in it too. Made
    // once the round's frame order is known, before any frame starts.
    let lock = null
    // The frames whose task still runs, the look-ahead waves still under way, and the first error of any of them: the
    // other frames stop at their next step, and the round throws it once nothing is under way any more.
    const running = new Set()
    const background = []
    let stopped = null
    const stop = (error) => {
      stopped ??= error
    }
    const climbing = () => [...running].filter((f) => s.progress.has(f) && !s.progress.get(f).done).length

    // Each look is recorded once and paid once. A look another task was already taking comes back marked cached (the
    // looker took it once); its record gives way to the paid one.
    function keepLooks(calls) {
      for (const c of calls) {
        const key = `${c.frame} ${c.sha256}`
        const had = looks.get(key)
        if (!had || (had.cached && !c.cached)) looks.set(key, c)
        if (!c.cached) paidLooks += Number.isFinite(c.costUsd) ? c.costUsd : 0
      }
    }

    // A picture in a frame with text over it that is too bright gets a dark overlay; the darkened file replaces it.
    async function darkenFrame(frameId) {
      const held = s.entries.get(frameId)
      const e = held.entry
      // A cut-out keeps its transparency: it is never darkened.
      if (e.darkened || e.cutout || darkChecked.has(e.sha256) || !wantsDark(idx.frames.get(e.frame))) return
      const bytes = await store.readPicture(path.basename(e.file))
      const dark = bytes ? await darkenPicture(bytes) : null
      if (!dark) {
        darkChecked.add(e.sha256)
        return
      }
      const name = await store.putPicture(dark.bytes, dark.ext)
      // Swapped only while the frame still shows the picture that was darkened (another frame's fewer-rows rung may
      // have hidden it meanwhile); nothing waits between this check and the swap.
      if (s.entries.get(frameId) !== held || held.entry !== e) return
      s.keepFile({ ...dark, sha256: name.split('.')[0] })
      held.entry = { ...e, ...fileFields(dark), darkened: true, overlay: dark.overlay, seen: null }
      delete held.entry.looker
    }

    // The look at a frame's picture, written on its entry when the frame still shows that picture.
    async function lookAtFrame(frameId) {
      const held = s.entries.get(frameId)
      if (!held || !LOOKED_SOURCES.has(held.entry.source) || !held.entry.file) return
      const { list, entry } = held
      const looked = await looker.look(
        { frames: list === 'frames' ? [entry] : [], siteSettings: list === 'siteSettings' ? [entry] : [] },
        { memo }
      )
      keepLooks(looked.doc.looker.calls)
      const [seen] = [...looked.doc.frames, ...looked.doc.siteSettings]
      const now = s.entries.get(frameId)
      if (now && seen?.looker && now.entry.sha256 === seen.sha256)
        now.entry = { ...now.entry, seen: seen.seen, looker: seen.looker }
    }

    // A visual readability failure overrides the mean-brightness shortcut exactly once for this candidate: true when the
    // frame's picture was darkened again, so its changed bytes get their own independent look before any rung. Other
    // faults remain recorded on the transform and are judged again, never removed or turned into an automatic pass.
    async function retryFrame(frameId) {
      const held = s.entries.get(frameId)
      const e = held?.entry
      if (
        !e ||
        e.looker?.verdict !== 'fail' ||
        !e.looker.faults.length ||
        !e.looker.faults.every((fault) => fault === TEXT_OVER_FAULT) ||
        !LOOKED_SOURCES.has(e.source) ||
        e.cutout ||
        idx.frames.get(frameId)?.kind === 'cutout' ||
        !wantsDark(idx.frames.get(frameId)) ||
        retried.has(`${frameId} ${e.sha256}`)
      )
        return false
      const bytes = await store.readPicture(path.basename(e.file))
      if (!bytes) return false
      const dark = await darkenPicture(bytes, { minimumStrength: 0.45 })
      if (!dark || dark.sha256 === e.sha256) return false
      await store.putPicture(dark.bytes, dark.ext)
      if (s.entries.get(frameId) !== held || held.entry !== e) return false
      s.keepFile(dark)
      const record = {
        frame: frameId,
        sourceSha256: e.sha256,
        sha256: dark.sha256,
        policy: PICTURE_PROCESSING_POLICY,
        strength: dark.overlay.strength,
        faults: [...e.looker.faults]
      }
      readabilityRetries.push(record)
      retried.add(`${frameId} ${e.sha256}`)
      retried.add(`${frameId} ${dark.sha256}`)
      held.entry = { ...e, ...fileFields(dark), darkened: true, overlay: dark.overlay, seen: null }
      delete held.entry.looker
      s.note(frameId, 'readability', 'darkened', JSON.stringify(record))
      return true
    }

    // Whether a frame whose picture was just looked at climbs one more rung; a rejection is recorded on its progress.
    // Synchronous: what it reads of other frames (whether one of them ended this frame's row) cannot change under it.
    function rejected(frameId) {
      const held = s.entries.get(frameId)
      if (!held) return false
      const { list, entry } = held
      if (entry.looker?.verdict !== 'fail' || !LOOKED_SOURCES.has(entry.source) || !climbable(frameId))
        return false
      if (!s.progress.has(frameId) && s.picked.has(frameId) && !lastRound) return false
      const faults = entry.looker.faults
      // A look that could not be read is no verdict on the picture: it fails L01 and the next round asks again.
      if (faults.every((f) => f === LOOK_UNREADABLE)) return false
      if (!s.progress.has(frameId)) s.progress.set(frameId, { at: 0, tried: new Set(), photos: 0 })
      const p = s.progress.get(frameId)
      if (p.done) return false
      if (OWNER_SOURCES.has(entry.source)) p.tried.add(entry.asset)
      p.faults = faults
      // Every rejected picture is kept as a candidate for the best-rejected rung, and every fault named for the
      // other compositions the redraw-alt rung asks for.
      p.rejected = [...(p.rejected ?? []), { list, entry: { ...entry }, faults: [...faults] }]
      p.allFaults = [...new Set([...(p.allFaults ?? []), ...faults])]
      s.note(frameId, p.last ?? 'placed', 'rejected', faults.join(', '))
      return true
    }

    // A frame on the any-photo rung whose next photo has no look yet gets its next photos looked at together: LOOK_AHEAD
    // of them, more when few frames climb (aheadDepth). A frame whose pictures are darkened when placed is left out: its
    // placed bytes are not the ones looked at. The photos are chosen in the lock, as the rung would choose them; their
    // looks are not waited for here: the frame's next placement waits for its own look alone, which the looker takes
    // once (looker-step.js).
    async function lookAheadFor(frameId) {
      if (lookAhead < 1 || !looker.ahead || !looker.known) return
      const pairs = await lock(frameId, async () => {
        const p = s.progress.get(frameId)
        if (
          !p ||
          p.done ||
          rungsFor(idx, frameId)[p.at] !== 'any-photo' ||
          wantsDark(idx.frames.get(frameId))
        )
          return []
        const [next] = await anyPhotoAhead(ctx, s, frameId, p, 1)
        if (!next || looker.known(next.entry, memo)) return []
        const depth = aheadDepth(climbing(), lookAhead, lookBudget)
        return (await anyPhotoAhead(ctx, s, frameId, p, depth)).map(({ list, entry }) => [list, entry])
      })
      if (pairs.length) background.push(looker.ahead(pairs, memo).then(keepLooks, stop))
    }

    // One frame's way through the round: its rung (when it climbs), its dark overlay, its look, and its next rung as
    // soon as that look rejects it, at most MAX_PASSES times.
    async function frameTask(frameId, climbsFirst) {
      running.add(frameId)
      try {
        let climbs = climbsFirst
        for (let pass = 0; !stopped; pass++) {
          if (climbs) await climbFrame(ctx, s, frameId, (fn) => lock(frameId, fn))
          const held = s.entries.get(frameId)
          // Nothing for the looker: hidden, returned, still waiting, or drawn by code (icons, initials).
          if (stopped || !held || !LOOKED_SOURCES.has(held.entry.source) || !held.entry.file) return
          await darkenFrame(frameId)
          await lookAtFrame(frameId)
          if (await retryFrame(frameId)) {
            climbs = false
            continue
          }
          if (!rejected(frameId) || pass >= MAX_PASSES) return
          await lookAheadFor(frameId)
          climbs = true
        }
      } finally {
        running.delete(frameId)
      }
    }

    // 1. The frames that wait for the drawer start at their first rung. Never an any-real or a person frame, whatever
    // waits: only a specific picture is drawn.
    const jobs = s.pending
      .filter((p) => p.waitsFor === WAITS_FOR_DRAWER && climbable(p.frame))
      .filter((p) => idx.wishes.get(p.frame).match === 'specific')
      .map((p) => p.frame)
    // Every cut-out frame climbs its own ladder (ladder-rungs.js): drawn when specific, else hidden or returned.
    const cutouts = s.pending
      .filter((p) => p.waitsFor === WAITS_FOR.cutout && climbable(p.frame))
      .map((p) => p.frame)
    for (const f of cutouts) {
      const match = idx.wishes.get(f).match
      if (match !== 'specific')
        s.note(f, 'draw', 'skipped', `a ${match} cut-out is never drawn, and no owner photo is cut out`)
    }
    jobs.push(...cutouts)
    // A gallery tile code found no photo for climbs its own ladder (next photo, fewer rows, reuse, return): never hidden.
    jobs.push(
      ...s.pending.filter((p) => p.waitsFor === WAITS_FOR.ladder && climbable(p.frame)).map((p) => p.frame)
    )
    for (const f of jobs) s.progress.set(f, { at: 0, tried: new Set(), photos: 0 })
    s.pending = s.pending.filter((p) => !jobs.includes(p.frame))
    // In the last round, a frame the picker placed that still fails the check gets no other picker round: it climbs.
    const stuck = lastRound
      ? [...failing].filter(([f]) => s.picked.has(f) && s.entries.get(f)?.entry.source === 'owner-photo')
      : []
    for (const [f, rules] of stuck) {
      s.progress.set(f, { at: 0, tried: new Set([s.entries.get(f).entry.asset]), photos: 0 })
      s.note(f, 'placed', 'failed the check', rules.join(', '))
    }
    const climbers = [...jobs, ...stuck.map(([f]) => f)]
    const placed = [...s.entries.keys()]
    // The orders the manifest writes its lists in: its frames as they came, then the frames placed in this round; the
    // ladder as one pass at a time would have noted it.
    const entryOrder = [...placed, ...jobs]
    const ladderOrder = [...s.ladder.keys(), ...climbers, ...placed]
    const returnsBefore = s.returns.length
    lock = frameLock(entryOrder)

    // 2 to 4, for every frame at once: the frames that climb start at their rung, every other placed picture at its look.
    const tasks = [
      ...climbers.map((f) => frameTask(f, true)),
      ...placed.filter((f) => !climbers.includes(f)).map((f) => frameTask(f, false))
    ]
    await Promise.all(tasks.map((t) => t.catch(stop)))
    await Promise.all(background)
    if (stopped) throw stopped

    const ordered = inFrameOrder([...s.entries], ([f]) => f, entryOrder)
    s.entries.clear()
    for (const [f, held] of ordered) s.entries.set(f, held)
    s.returns = [
      ...s.returns.slice(0, returnsBefore),
      ...inFrameOrder(s.returns.slice(returnsBefore), (r) => r.frame, entryOrder)
    ]
    // The whole manifest with every look on it, the twins' and the alts too, and the looker's rule: each of its looks was
    // taken above, so this asks the looker nothing new.
    const looked = await looker.look(s.docOf(), { memo })
    keepLooks(looked.doc.looker.calls)
    const lookCalls = inFrameOrder([...looks.values()], (c) => c.frame, entryOrder)
    const draws = inFrameOrder(s.draws, (c) => c.frame, entryOrder)
    const out = looked.doc
    return {
      doc: {
        ...out,
        looker: { ...out.looker, calls: lookCalls },
        rows: s.rows,
        readabilityRetries: [
          ...readabilityRetries.slice(0, earlierRetries),
          ...inFrameOrder(readabilityRetries.slice(earlierRetries), (r) => r.frame, entryOrder)
        ],
        ladder: inFrameOrder([...s.ladder], ([f]) => f, ladderOrder).map(([frame, steps]) => ({
          frame,
          steps
        })),
        drawer: {
          model: drawer?.model ?? null,
          door: drawer?.snapshot ?? null,
          promptSha256: drawer?.promptSha256 ?? null,
          count: counted(out.frames) + counted(out.siteSettings),
          calls: draws
        },
        cost: { ...out.cost, looker: sum(lookCalls, 'costUsd'), drawer: sum(draws, 'costUsd') },
        timing: { ...out.timing, looker: sum(lookCalls, 'ms'), drawer: sum(draws, 'ms') }
      },
      rule: looked.rule,
      paid:
        paidLooks +
        sum(
          draws.filter((c) => !c.cached),
          'costUsd'
        ),
      files: s.files
    }
  }

  return { finish }
}
