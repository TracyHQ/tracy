// The looker in the picture step's rounds (#343, ADR 0043). The shared run loop (lib/bench-run-loop.js) checks a round
// synchronously and is left as it is, so the looks run where the round is saved: withLooker wraps the step's store,
// and its saveRound looks at every picture of a checked round (looker-step.js) before the round is written, adds the
// looker's rule L01 to the round's check result and splits it again for the picker (picker-picks.js splitForPicker).
// The stored manifest, check result and failure list therefore hold the looks, and the next fix round sends back the
// rejected frames the picker placed, with their fault names.
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
 * The picture step with the looker in it: its prepare remembers the run's ready state, and its store's saveRound looks
 * at every picture of a checked round before the round is written, so the stored manifest, check result and failure
 * list hold the looks.
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
      if (ready.ok) readyOf.set(row.id, ready)
      return ready
    },
    store: Object.freeze({
      ...store,
      saveRound: async (pool, args) => {
        const looker = readyOf.get(args.runId)?.looker
        if (args.state !== 'checked' || !args.pictures || !looker) return store.saveRound(pool, args)
        const looked = await looker.look(args.pictures)
        const checkResult = withLookerRule(args.checkResult, looked.rule, looked.doc)
        return store.saveRound(pool, {
          ...args,
          pictures: looked.doc,
          checkResult,
          failureList: step.checker.failureListText(checkResult)
        })
      }
    })
  })
}
