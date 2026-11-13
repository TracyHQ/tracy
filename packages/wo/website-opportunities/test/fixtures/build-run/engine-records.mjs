// A replica of the step chain engine's record keeping, for the Contract B mapping tests (#597). The real engine lives in
// apps/tracy-web (`src/sites/brief-engines/step-chain.js`, `attempt` and `end`; `step-chain-record.js`, `detailsOf`
// and `incompleteStop`); a domain package must not import an app, so the rules are copied here exactly and kept small:
//   - every attempt of a step is one record line `{step, attempt, startMs, endMs, usd, outcome, code?, error?,
//     details?, inputs, output}`, its outcome `done`, `failed, re-running`, `failed` or `stopped`;
//   - a step is re-run once; it stops for good on its second failure, at once when its error carries `noRerun: true`,
//     and at once (outcome `stopped`) when the run's signal was aborted (deadline, cancel, the stop of another step);
//   - the first step to stop for good becomes the run's `stop` `{step, attempts, code?, error, details?}` and aborts
//     the steps still running;
//   - the run frame ends a run outside the steps with `end(reason)`: stop `{step: <first running step> | 'run',
//     attempts: 0, code: STEP_CHAIN_RUN_FAILED}`;
//   - `details` heavier than 4096 bytes of JSON are kept cut, marked `truncated`.
// If the engine's rules change, change this copy with them.

export const STEP_CHAIN_ATTEMPTS = 2
export const STEP_CHAIN_RUN_FAILED = 'STEP_CHAIN_RUN_FAILED'
export const STEP_CHAIN_INCOMPLETE = 'STEP_CHAIN_INCOMPLETE'
const MAX_ERROR_DETAILS_BYTES = 4096

const messageOf = (error) => String(error instanceof Error ? error.message : error).slice(0, 300)

function detailsOf(error) {
  const details = error?.details
  if (details === undefined || details === null) return {}
  const json = JSON.stringify(details)
  if (Buffer.byteLength(json) <= MAX_ERROR_DETAILS_BYTES) return { details: JSON.parse(json) }
  return {
    details: { truncated: true, json: Buffer.from(json).subarray(0, MAX_ERROR_DETAILS_BYTES).toString() }
  }
}

/** The stop of a run that ended before its Write step completed, when nobody named a reason. */
export const incompleteStop = () => ({
  step: 'write',
  attempts: 0,
  code: STEP_CHAIN_INCOMPLETE,
  error: 'the run ended before the write step completed'
})

/** A failure a scripted step throws: `{code?, noRerun?, details?}` on an Error. */
export const failure = (message, extra = {}) => Object.assign(new Error(message), extra)

/**
 * A run with the engine's record rules. `step(name, script)` runs one step: `script` is a list of attempt results, each
 * `'done'`, an Error (`failure`), `'hang'` (waits until the run's signal aborts) or a promise of one of the first two
 * (the test settles it after a snapshot). `snapshot()` is what the engine
 * hands its progress: the record, the steps running and the stop.
 */
export function engineRun({ signal: outer } = {}) {
  let clock = 0
  const halt = new AbortController()
  const signal = outer ? AbortSignal.any([outer, halt.signal]) : halt.signal
  const run = { record: [], stop: null, active: new Map() }
  const line = (step, n, start, extra) => ({
    step,
    attempt: n,
    startMs: start,
    endMs: ++clock,
    usd: 0,
    ...extra,
    inputs: {},
    output: null
  })
  async function step(name, script) {
    for (let n = 1; ; n += 1) {
      if (run.stop) return 'halted'
      const start = ++clock
      run.active.set(name, start)
      try {
        if (signal.aborted) throw signal.reason ?? new Error('the build stopped')
        // A step is an async call: it answers on a later turn, as every real step does.
        await new Promise((resolve) => setImmediate(resolve))
        const result = script[n - 1]
        if (result === 'hang')
          await new Promise((_, reject) => {
            if (signal.aborted) reject(signal.reason)
            signal.addEventListener('abort', () => reject(signal.reason))
          })
        const settled = typeof result?.then === 'function' ? await result : result
        if (settled instanceof Error) throw settled
        run.active.delete(name)
        run.record.push(line(name, n, start, { outcome: 'done' }))
        return 'done'
      } catch (error) {
        run.active.delete(name)
        const stopped = signal.aborted
        const last = stopped || error?.noRerun === true || n >= STEP_CHAIN_ATTEMPTS
        const entry = line(name, n, start, {
          outcome: stopped ? 'stopped' : last ? 'failed' : 'failed, re-running',
          ...(typeof error?.code === 'string' ? { code: error.code } : {}),
          error: messageOf(error),
          ...detailsOf(error)
        })
        run.record.push(entry)
        if (last && !run.stop) {
          run.stop = {
            step: name,
            attempts: n,
            ...(entry.code ? { code: entry.code } : {}),
            error: entry.error,
            ...(entry.details !== undefined ? { details: entry.details } : {})
          }
          halt.abort(new Error(`the ${name} step failed`))
        }
        if (last) return 'halted'
      }
    }
  }
  /** The run frame failed the run outside the steps (the site never came up, the apply timed out). */
  function end(reason) {
    if (!run.stop && reason !== undefined) {
      run.stop = {
        step: [...run.active.keys()][0] ?? 'run',
        attempts: 0,
        code: typeof reason?.code === 'string' ? reason.code : STEP_CHAIN_RUN_FAILED,
        error: messageOf(reason)
      }
      halt.abort(new Error('the run failed'))
    }
  }
  const snapshot = () => ({
    record: structuredClone(run.record),
    running: [...run.active.keys()],
    stop: run.stop ? structuredClone(run.stop) : null
  })
  return { run, step, end, snapshot, signal }
}
