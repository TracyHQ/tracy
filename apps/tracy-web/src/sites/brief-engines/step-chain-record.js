/**
 * The record a step chain run keeps (ADR 0047, decision 5; #591): how each value is written into a record line, the
 * bounded error details a line and a stop report carry, and the measurement the row and the kept record share
 * (`chainSummary`). The engine itself lives in `step-chain.js`.
 */

/** The code of a stop the run frame reports: the run failed outside the engine (site, setup hold, a timeout). */
export const STEP_CHAIN_RUN_FAILED = 'STEP_CHAIN_RUN_FAILED'

/** The code of a stop recorded when a run ended without a completed Write step and nobody named why. */
export const STEP_CHAIN_INCOMPLETE = 'STEP_CHAIN_INCOMPLETE'

/** The most a line's or a stop report's error details may weigh, as JSON. */
export const MAX_ERROR_DETAILS_BYTES = 4096

export const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places

/** When each running step started, ISO, from the clock readings the run keeps (`active`). */
export const sinceOf = (active) =>
  Object.fromEntries([...active].map(([step, ms]) => [step, new Date(ms).toISOString()]))

export const messageOf = (error) => String(error instanceof Error ? error.message : error).slice(0, 300)

/**
 * The `details` an error carries (a page writer's failing fields, a picture step's failing pictures), JSON safe and
 * bounded: cycles, functions and big integers are dropped or written as text, and details heavier than
 * `MAX_ERROR_DETAILS_BYTES` are kept as their JSON text cut to that size, marked `truncated`.
 * @param {any} error
 * @returns {{details?: any}}
 */
export function detailsOf(error) {
  const details = error?.details
  if (details === undefined || details === null) return {}
  const seen = new WeakSet()
  let json
  try {
    json = JSON.stringify(details, (_key, value) => {
      if (typeof value === 'bigint') return String(value)
      if (typeof value === 'function' || typeof value === 'symbol') return undefined
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[circular]'
        seen.add(value)
      }
      return value
    })
  } catch {
    return { details: { unreadable: true } }
  }
  if (json === undefined) return {}
  if (Buffer.byteLength(json) <= MAX_ERROR_DETAILS_BYTES) return { details: JSON.parse(json) }
  return {
    details: { truncated: true, json: Buffer.from(json).subarray(0, MAX_ERROR_DETAILS_BYTES).toString() }
  }
}

/**
 * A value as the record keeps it: a template kit by its ref (its document is the kit's own file), a Write step's answer by
 * its report's status, counts and cause, anything else as it is (file paths, small objects).
 * @param {any} value
 */
export function recordedValue(value) {
  if (!value || typeof value !== 'object') return value ?? null
  if (typeof value.ref === 'string' && ('doc' in value || 'contentMap' in value)) return { ref: value.ref }
  if (value.report && typeof value.report === 'object') {
    const { status, counts, cause } = value.report
    return { report: { status: status ?? null, counts: counts ?? null, ...(cause ? { cause } : {}) } }
  }
  return value
}

/** A step's inputs as the record keeps them, each by `recordedValue`. */
export const recordedInputs = (inputs) =>
  Object.fromEntries(Object.entries(inputs ?? {}).map(([name, value]) => [name, recordedValue(value)]))

/** The USD fields of a record line, from a step's answer or its error. */
export const spendOf = (from) => ({
  usd: from?.usd === null ? null : Number(from?.usd ?? 0),
  ...(from?.usd === null ? { knownUsd: Number(from?.knownUsd ?? 0) } : {})
})

/** What a Write step's value adds to its record line: the site recovery and the structural diagnostics it measured. */
export const writeExtras = (value) => ({
  ...(value?.report?.recovery ? { recovery: value.report.recovery } : {}),
  ...(value?.diagnostics ? { diagnostics: value.diagnostics } : {})
})

/** Whether the record ends with a completed Write step: the only way a run is `complete` (ADR 0047, decision 3). */
export const endsWithWrite = (record) => {
  const last = record.at(-1)
  return last?.step === 'write' && last.outcome === 'done'
}

/**
 * The measurement the row keeps (`timings.chain`) and the run's kept record carries: per step attempt its minutes and
 * USD, the totals, and how the run ended: `running`, `complete` (the last line is a completed Write step, and nothing
 * stopped the run) or `stopped` (a step failed twice, a model door was empty, the run frame failed, or the run ended
 * before its Write step completed; `failedStep` and `stop` name why).
 * @param {Array<{step: string, startMs: number, endMs: number, usd: number | null, knownUsd?: number, outcome: string, error?: string}>} record
 * @param {string | null} failed
 * @param {number} totalMs
 * @param {string[] | null} [running] - the steps under way, for a snapshot of a run still going
 * @param {Record<string, string> | null} [runningSince] - when each running step started, ISO
 * @param {object | null} [stop] - the stop report, when the build stopped
 */
export function chainSummary(record, failed, totalMs, running = null, runningSince = null, stop = null) {
  const complete = record.every((s) => Number.isFinite(s.usd))
  const knownUsd = round(
    record.reduce(
      (sum, s) => sum + (Number.isFinite(s.usd) ? s.usd : Number.isFinite(s.knownUsd) ? s.knownUsd : 0),
      0
    ),
    4
  )
  // A run with no stop and no completed Write step at its end did not finish: it is never `complete`.
  const unfinished = !running && !failed && !endsWithWrite(record)
  const failedStep = failed ?? (unfinished ? 'write' : null)
  const stopped = stop ?? (unfinished ? incompleteStop() : null)
  return {
    // A snapshot of a run still going (`running`: the steps under way) says so; the row's state tells the reader whether
    // the run is still going.
    ending: running ? 'running' : failedStep ? 'stopped' : 'complete',
    ...(running ? { running, ...(runningSince ? { runningSince } : {}) } : failedStep ? { failedStep } : {}),
    // The report for the Tracy team when the build stopped: the step, its inputs, its output and the error (ADR 0047).
    ...(stopped ? { stop: stopped } : {}),
    totalMinutes: round(totalMs / 60_000, 2),
    totalUsd: complete ? knownUsd : null,
    ...(complete ? {} : { knownUsd }),
    steps: record.map((s) => ({
      ...s,
      minutes: round((s.endMs - s.startMs) / 60_000, 2),
      usd: Number.isFinite(s.usd) ? round(s.usd, 4) : null
    }))
  }
}

/** The stop of a run that ended before its Write step completed, when nobody named a reason. */
export const incompleteStop = () => ({
  step: 'write',
  attempts: 0,
  code: STEP_CHAIN_INCOMPLETE,
  error: 'the run ended before the write step completed'
})

/**
 * The base site as a step of the measurement. The host makes it beside the model steps, from the press until the host
 * says it is up, so it is not timed by the chain's own clock: its minutes are given. It costs no model money.
 * @param {ReturnType<typeof chainSummary>} chain
 * @param {number} ms - from the press until the site was up
 */
export function withBaseSite(chain, ms) {
  const minutes = round(Math.max(0, Number.isFinite(ms) ? ms : 0) / 60_000, 2)
  return { ...chain, steps: [{ step: 'site', minutes, usd: 0, outcome: 'done' }, ...chain.steps] }
}
