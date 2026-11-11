// Finishing a checked round of the picture step (#344, ADR 0043 sections 3 and 4): the drawer, the dark overlays, the
// looker and the fallback ladder, in that order, on the manifest the picker and code made.
//
// 1. Every frame that waits for the drawer (a `specific` frame no owner photo fits, or that the picker answered "none")
//    is drawn, at most DRAW_CONCURRENCY at a time: a wide band with a portrait owner photo of the frame's own offering
//    is extended from it (`owner-photo-extended`), any other frame drawn as a scene or an object (`drawn`). An
//    `any-real` or `person` frame is never drawn or extended. Every cut-out frame (#346) starts its own ladder too: a
//    `specific` one is drawn on a plain ground whose colour code removes (cutout-ground.js), any other is hidden or
//    returned at once (never a demo figure, never an owner photo cut out).
// 2. A picture in a frame with text over it that is still too bright gets a dark overlay baked in (darken.js).
// 3. The looker looks at every finished picture (looker-step.js).
// 4. Each rejected frame climbs its ladder (ladder-rungs.js): draw, one redraw with the fault names, the next photo,
//    fewer rows (where the kit allows), hidden (where the kit allows), drawn again in other compositions, the best
//    picture rejected for minor faults only kept, and only then returned to the planner. A gallery tile is never
//    hidden alone: after fewer rows it reuses an owner photo of its page cut to another region (ladder-reuse.js), and a
//    gallery tile code found no photo for waits for this ladder. After each rung the
//    changed pictures are looked at again. A frame the picker placed climbs only in the last round (and then also when
//    it still fails the picture check): before it, the picker gets it back with its fault names. A look that could not
//    be read is no rejection: the picture fails L01 and the next round asks again.
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
import { climbAll, DRAW_CONCURRENCY, NEXT_PHOTO_TRIES, REDRAW_ALT_TRIES } from './ladder-climb.js'
import { ladderState } from './ladder-state.js'
import { LOOK_UNREADABLE, TEXT_OVER_FAULT } from './looker-call.js'
import { LOOKED_SOURCES } from './looker-step.js'
import { OWNER_SOURCES } from './manifest-shape.js'
import { WAITS_FOR_DRAWER } from './picker-picks.js'
import { PICTURE_PROCESSING_POLICY } from './picture-prompts.js'

export { DRAW_CONCURRENCY, NEXT_PHOTO_TRIES, REDRAW_ALT_TRIES }

// A gallery tile's any-photo rung may try every owner photo of the brief, one look per pass.
const MAX_PASSES = 40
const NOT_DRAWN_KINDS = new Set(['icon', 'logo'])
const DRAWN_SOURCES = new Set(['drawn', 'owner-photo-extended'])

const sum = (list, key) => list.reduce((n, c) => n + (Number.isFinite(c[key]) ? c[key] : 0), 0)
const counted = (list) => list.filter((e) => DRAWN_SOURCES.has(e.source)).length

/**
 * The finisher of one run.
 * @param {{ idx: object, plan: object, kit: object, usable: object[], photoBytes: Map<string, Buffer>,
 *   store: ReturnType<import('./file-store.js').fileStore>, looker: { look: Function },
 *   drawing: { draw: Function } | null, drawer: { model: string | null, snapshot: object | null, promptSha256: string } }} input
 *   `drawing` ladder-draw.js createDrawing, or null when the run has no drawer door
 */
export function createFinisher({ idx, plan, kit, usable, photoBytes, store, looker, drawing, drawer }) {
  const ctx = { idx, plan, kit, usable, photoBytes, store, drawing, luminance: new Map() }
  const climbable = (frameId) => {
    const frame = idx.frames.get(frameId)
    return Boolean(idx.wishes.get(frameId)) && Boolean(frame) && !NOT_DRAWN_KINDS.has(frame.kind)
  }

  // A picture in a frame with text over it that is too bright gets a dark overlay; the darkened file replaces it.
  async function darkenAll(s, darkChecked) {
    for (const held of s.entries.values()) {
      const e = held.entry
      // A cut-out keeps its transparency: it is never darkened.
      if (!LOOKED_SOURCES.has(e.source) || e.darkened || e.cutout || darkChecked.has(e.sha256)) continue
      if (!wantsDark(idx.frames.get(e.frame))) continue
      const bytes = await store.readPicture(path.basename(e.file))
      const dark = bytes ? await darkenPicture(bytes) : null
      if (!dark) {
        darkChecked.add(e.sha256)
        continue
      }
      const name = await store.putPicture(dark.bytes, dark.ext)
      s.keepFile({ ...dark, sha256: name.split('.')[0] })
      held.entry = { ...e, ...fileFields(dark), darkened: true, overlay: dark.overlay, seen: null }
      delete held.entry.looker
    }
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
    const retried = new Set(
      readabilityRetries.flatMap((r) => [`${r.frame} ${r.sourceSha256}`, `${r.frame} ${r.sha256}`])
    )
    async function retryReadability() {
      let changed = false
      for (const [frameId, held] of s.entries) {
        const e = held.entry
        if (
          e.looker?.verdict !== 'fail' ||
          !e.looker.faults.length ||
          !e.looker.faults.every((fault) => fault === TEXT_OVER_FAULT) ||
          !LOOKED_SOURCES.has(e.source) ||
          e.cutout ||
          idx.frames.get(frameId)?.kind === 'cutout' ||
          !wantsDark(idx.frames.get(frameId)) ||
          retried.has(`${frameId} ${e.sha256}`)
        )
          continue
        const bytes = await store.readPicture(path.basename(e.file))
        if (!bytes) continue
        const dark = await darkenPicture(bytes, { minimumStrength: 0.45 })
        if (!dark || dark.sha256 === e.sha256) continue
        await store.putPicture(dark.bytes, dark.ext)
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
        changed = true
      }
      return changed
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
    let climbing = [...jobs, ...stuck.map(([f]) => f)]
    let looked
    for (let pass = 0; ; pass++) {
      await climbAll(ctx, s, climbing)
      // 2. Dark frames, then 3. the looker.
      await darkenAll(s, darkChecked)
      looked = await looker.look(s.docOf(), { memo })
      paidLooks += looked.paid
      // The first record of each look is kept: a look taken again in a later pass is the same look.
      for (const c of looked.doc.looker.calls)
        if (!looks.has(`${c.frame} ${c.sha256}`)) looks.set(`${c.frame} ${c.sha256}`, c)
      for (const e of [...looked.doc.frames, ...looked.doc.siteSettings]) {
        const held = s.entries.get(e.frame)
        if (held && held.entry.sha256 === e.sha256)
          held.entry = { ...held.entry, seen: e.seen, looker: e.looker }
      }
      // A visual readability failure overrides the mean-brightness shortcut exactly once for this candidate. Do
      // not advance any fallback until the changed bytes receive their own independent look. Other faults remain
      // recorded on the transform and are judged again, never removed or turned into an automatic pass.
      if (await retryReadability()) {
        climbing = []
        continue
      }
      // 4. Every rejected frame that may climb climbs one more rung.
      climbing = []
      for (const [frameId, { list, entry }] of s.entries) {
        if (entry.looker?.verdict !== 'fail' || !LOOKED_SOURCES.has(entry.source) || !climbable(frameId))
          continue
        if (!s.progress.has(frameId) && s.picked.has(frameId) && !lastRound) continue
        const faults = entry.looker.faults
        // A look that could not be read is no verdict on the picture: it fails L01 and the next round asks again.
        if (faults.every((f) => f === LOOK_UNREADABLE)) continue
        if (!s.progress.has(frameId)) s.progress.set(frameId, { at: 0, tried: new Set(), photos: 0 })
        const p = s.progress.get(frameId)
        if (p.done) continue
        if (OWNER_SOURCES.has(entry.source)) p.tried.add(entry.asset)
        p.faults = faults
        // Every rejected picture is kept as a candidate for the best-rejected rung, and every fault named for the
        // other compositions the redraw-alt rung asks for.
        p.rejected = [...(p.rejected ?? []), { list, entry: { ...entry }, faults: [...faults] }]
        p.allFaults = [...new Set([...(p.allFaults ?? []), ...faults])]
        s.note(frameId, p.last ?? 'placed', 'rejected', faults.join(', '))
        climbing.push(frameId)
      }
      if (!climbing.length || pass >= MAX_PASSES) break
    }

    const lookCalls = [...looks.values()]
    const out = looked.doc
    return {
      doc: {
        ...out,
        looker: { ...out.looker, calls: lookCalls },
        rows: s.rows,
        readabilityRetries,
        ladder: [...s.ladder].map(([frame, steps]) => ({ frame, steps })),
        drawer: {
          model: drawer?.model ?? null,
          door: drawer?.snapshot ?? null,
          promptSha256: drawer?.promptSha256 ?? null,
          count: counted(out.frames) + counted(out.siteSettings),
          calls: s.draws
        },
        cost: { ...out.cost, looker: sum(lookCalls, 'costUsd'), drawer: sum(s.draws, 'costUsd') },
        timing: { ...out.timing, looker: sum(lookCalls, 'ms'), drawer: sum(s.draws, 'ms') }
      },
      rule: looked.rule,
      paid:
        paidLooks +
        sum(
          s.draws.filter((c) => !c.cached),
          'costUsd'
        ),
      files: s.files
    }
  }

  return { finish }
}
