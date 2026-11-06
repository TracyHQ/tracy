// The looker, the drawer and the fallback ladder in the picture step's rounds (#343, #344, ADR 0043). The shared run
// loop (lib/bench-run-loop.js) checks a round synchronously and is left as it is, so the round is finished where it is
// saved: withLooker wraps the step's store, and its saveRound finishes every checked round (ladder-step.js: drawings,
// dark overlays, looks and the ladder) before the round is written, stores the files it made, grades the finished
// manifest again with the picture check, adds the looker's rule L01 and splits the result again for the picker
// (picker-picks.js splitForPicker). The stored manifest, check result and failure list therefore hold the drawings and
// the looks, and the next fix round sends back the rejected frames the picker placed, with their fault names. Every
// saved manifest entry carries its frame's surface (textOver, templateOverlay; frame-surface/surface.js stampSurface).
// When the drawer's provider keeps failing a drawing (ladder-draw.js DrawerProviderError, card AU), the round is saved
// failed with that error, so the run ends failed naming the frame and the status, and no frame is hidden for it.
import sharp from 'sharp'
import { addRunCost, saveFile } from './bench-store.js'
import { stampSurface } from './frame-surface/surface.js'
import { DrawerProviderError } from './ladder-draw.js'
import { LOOKER_RULE } from './looker-step.js'
import { splitForPicker } from './picker-picks.js'

/** A picture check result with the looker's rule in it (replacing an earlier one), split again for the picker. */
export function withLookerRule(result, rule, doc) {
  const rules = [...(result.rules ?? []).filter((r) => r.id !== LOOKER_RULE.id), rule]
  const summary = { pass: 0, fail: 0, skip: 0 }
  for (const r of rules) summary[r.status]++
  return splitForPicker({ ...result, rules, summary }, doc)
}

/**
 * The picture step with the looker (and the drawer and the ladder) in it: its prepare remembers the run's ready state,
 * and its store's saveRound finishes every checked round before it is written.
 */
export function withLooker(step) {
  const readyOf = new Map()
  const { store } = step
  return Object.freeze({
    ...step,
    prepare: async (deps, row) => {
      const ready = await step.prepare(deps, row)
      // One run at a time (BENCH_QUEUE): the last prepared run is the only one the loop plays.
      readyOf.clear()
      if (ready.ok) readyOf.set(row.id, { ready, row })
      return ready
    },
    store: Object.freeze({
      ...store,
      saveRound: async (pool, args) => {
        const held = readyOf.get(args.runId)
        const stamped = (doc) => stampSurface(doc, held?.ready.idx?.frames)
        if (args.state !== 'checked' || !args.pictures || !held?.ready.looker)
          return store.saveRound(pool, args.pictures ? { ...args, pictures: stamped(args.pictures) } : args)
        const { ready, row } = held
        if (!ready.finisher) {
          const looked = await ready.looker.look(args.pictures)
          if (looked.paid > 0)
            await addRunCost(pool, { runId: args.runId, usd: looked.paid, leaseToken: args.leaseToken })
          const checkResult = withLookerRule(args.checkResult, looked.rule, looked.doc)
          return store.saveRound(pool, {
            ...args,
            pictures: stamped(looked.doc),
            checkResult,
            failureList: step.checker.failureListText(checkResult)
          })
        }
        // The last round is the one no picker round follows: then the picker's frames climb the ladder too.
        const lastRound = args.round >= step.maxFixRounds || !ready.picker?.frames?.length
        const failing = new Map()
        for (const r of args.checkResult?.rules ?? [])
          for (const f of r.failures ?? []) {
            const frame = String(f.where).replace(/^siteSettings /, '')
            failing.set(frame, [...new Set([...(failing.get(frame) ?? []), r.id])])
          }
        let finished
        try {
          finished = await ready.finisher.finish(args.pictures, { lastRound, failing })
        } catch (error) {
          if (!(error instanceof DrawerProviderError)) throw error
          return store.saveRound(pool, {
            ...args,
            pictures: stamped(args.pictures),
            state: 'failed',
            error: `${error.code}: ${error.message}`
          })
        }
        for (const f of finished.files) {
          if (!ready.files[f.file])
            ready.files[f.file] = { sha256: f.sha256, width: f.width, height: f.height }
          const bytes = await ready.store.readPicture(f.name)
          if (!bytes) continue
          const meta = await sharp(bytes).metadata()
          await saveFile(pool, {
            runId: args.runId,
            sha256: f.sha256,
            path: f.name,
            bytes: bytes.length,
            width: meta.width,
            height: meta.height,
            costUsd: f.costUsd
          })
        }
        // The run's cost holds every role: what these drawings and looks spent is added to the picker's turns.
        if (finished.paid > 0)
          await addRunCost(pool, { runId: args.runId, usd: finished.paid, leaseToken: args.leaseToken })
        const doc = stamped(finished.doc)
        const checkResult = withLookerRule(step.checker.check({ doc, row, ready }), finished.rule, doc)
        return store.saveRound(pool, {
          ...args,
          pictures: doc,
          checkResult,
          failureList: step.checker.failureListText(checkResult)
        })
      }
    })
  })
}
