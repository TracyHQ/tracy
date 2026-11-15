// The run records of draft writes, kept outside the process (#612). A draft write keeps its run record (`{state,
// save(state)}`: the write's resume point, `state.wrote`, and for a revision the undo journal `state.undo` of
// `step-chain-draft-journal.js`) and saves it BEFORE each door call. While that record lived in a Map of the process,
// a run whose process died lost it: neither a resume nor an abandon (`step-chain-draft-abandon.js`) could read it
// back. Here the record is saved through an injected store, so a new process reads what the last `save` stored.
//
// THE STORE INTERFACE (`RUN_RECORD_METHODS`). One store answers every site; each call names its site by `ctx.siteKey`,
// the run's own site, and a run id is read only on the site it was written for.
//   append(runId, state, ctx)   keep `state` (JSON) as the run's newest record; earlier ones may stay, only the newest
//                               is read. Answers true, or false (nothing kept) once the run is closed
//   read(runId, ctx)            `{state, closed}`: the newest state kept and whether the run is closed; null when the
//                               run kept nothing on this site
//   close(runId, ctx)           the run ended done: its record is final, no later append changes it. Answers true when
//                               it closed an open run, false otherwise (unknown, or closed already)
// The contract both a memory store and a durable one must pass: `test/step-chain-draft-run-records-contract.mjs`.
//
// 🔒 A RECORD NEVER HOLDS A HELD TEXT. The journal keeps `HELD_BEFORE` for a value before that names one and the
// revision masks every key that names one (`maskHeld`), so what is saved here is already clean; the test of this file
// greps every saved state of a hold revision for the held forms.
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'

/** The methods a run record store must answer. */
export const RUN_RECORD_METHODS = Object.freeze(['append', 'read', 'close'])

/** The methods `store` lacks (an empty list: it is a whole run record store). */
export const missingRunRecordMethods = (store) =>
  RUN_RECORD_METHODS.filter((name) => typeof store?.[name] !== 'function')

/** The site a call names, or a typed error. */
export function siteKeyOf(ctx) {
  const key = ctx?.siteKey
  if (typeof key !== 'string' || key.trim() === '')
    throw Object.assign(new Error('a run record call names its site (ctx.siteKey)'), {
      code: 'site_key_missing'
    })
  return key
}

/** A JSON copy: what a store keeps is never the object the write goes on changing. */
const copyOf = (state) => JSON.parse(JSON.stringify(state ?? null))

/**
 * A run record store in memory. For tests and as the process's own store when no durable one is wired (the lifetime a
 * Map of the process gave before): it forgets everything when the process ends.
 */
export function memoryRunRecords() {
  const sites = new Map()
  const runsOf = (ctx) => {
    const key = siteKeyOf(ctx)
    if (!sites.has(key)) sites.set(key, new Map())
    return sites.get(key)
  }
  return {
    async append(runId, state, ctx) {
      const runs = runsOf(ctx)
      const run = runs.get(String(runId)) ?? { states: [], closed: false }
      if (run.closed) return false
      run.states.push(JSON.stringify(copyOf(state)))
      runs.set(String(runId), run)
      return true
    },
    async read(runId, ctx) {
      const run = runsOf(ctx).get(String(runId))
      if (!run || run.states.length === 0) return null
      return { state: JSON.parse(run.states.at(-1)), closed: run.closed }
    },
    async close(runId, ctx) {
      const run = runsOf(ctx).get(String(runId))
      if (!run || run.closed) return false
      run.closed = true
      return true
    }
  }
}

/**
 * The run record of `runId` over `store`, as a draft write takes it: `state` is what the store kept last (a resume in
 * a new process starts from it), `save(state)` appends. A closed run's record is not written again.
 * @returns {Promise<{state?: object, save: (state: object) => Promise<void>}>}
 */
export async function durableRunRecord(store, runId, ctx) {
  const kept = await store.read(runId, ctx)
  if (kept?.closed)
    throw new DraftWriteError('write_record_stale', 'the run record of this run is closed: the run ended', {
      run: String(runId)
    })
  const record = {
    save: async (state) => {
      if ((await store.append(runId, state, ctx)) === false)
        throw new DraftWriteError(
          'write_record_stale',
          'the run record of this run is closed: the run ended',
          {
            run: String(runId)
          }
        )
    }
  }
  if (kept) record.state = kept.state
  return record
}

/**
 * `runRecordOf(runId, ctx)` of the rebuild wiring (`build-draft-rebuild-wiring.js`): the record of an UNFINISHED run,
 * `{state}`, or null when the run kept none on this site or ended done.
 */
export const runRecordReader = (store) => async (runId, ctx) => {
  if (!store || missingRunRecordMethods(store).length) return null
  const kept = await store.read(runId, ctx)
  return kept && !kept.closed ? { state: kept.state } : null
}
