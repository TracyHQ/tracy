// The brand step before the site exists (ticket #616): the step chain's OWN kit and brand steps, run outside a build.
// The brand step is the locked brand bench (`brand-step/`, prompt v10) exactly as a build runs it (`run --kit <ref>
// --brief-revision <id>`): it reads the stored research brief of a research revision and the template kit, never a
// site, so nothing here replaces or re-decides it. This adapter gives the two steps (`createStepChainSteps`) a context
// of their own, reads the brand file the run wrote as the look record (`brandLookOf`), and keeps the record with the
// step's files like a build does (`dispose`).
//
// The input is a research revision (`{revisionId}`) or a brief held in memory (`{brief, logoFile?}`, written to the run's
// folder and given to the bench as `--brief-file`), never both.
//
// The attempts are the engine's (`step-chain.js`): at most `STEP_CHAIN_ATTEMPTS` per step, no rerun of an error marked
// `noRerun` or of an attempt under a stopped signal, and record lines of the engine's shape, written with the engine's
// own record helpers (`step-chain-record.js`). The engine's `attempt` itself is a closure inside
// `createStepChainEngine`, bound to a whole build run (its stop, halt, progress snapshots and the parallel plan branch),
// and is not exported: `attemptStep` below mirrors it for a run of two steps, and a test compares its lines with lines
// the engine itself writes.
//
// The bench spends three model doors, all the bench's own and unchanged: the brand agent (`brandAgent`: tool calls and
// vision, several turns per run), the brand reviewer (`brandReviewer`: vision, one call per look it judges) and the
// picture door for drawn icons (`seedImage`, one call per drawing attempt, only when an icon is drawn).
import { readFile } from 'node:fs/promises'
import { BrandStepError, brandLookOf } from 'website-opportunities/domain/brand-before-site.mjs'
import { STEP_CHAIN_ATTEMPTS, STEP_CHAIN_NO_OUTPUT } from './sites/brief-engines/step-chain.js'
import {
  detailsOf,
  messageOf,
  recordedInputs,
  recordedValue,
  spendOf
} from './sites/brief-engines/step-chain-record.js'

/** The locked prompt the brand bench runs (`brand-step/brand-step.system.md`), recorded with every look record. */
export const BRAND_STEP_PROMPT = Object.freeze({ file: 'brand-step.system.md', version: 10 })

let sequence = 0

/**
 * One step, at most `STEP_CHAIN_ATTEMPTS` times, one record line per attempt, as the engine's `attempt` does.
 * @returns {Promise<{value: any} | {stop: object}>}
 */
async function attemptStep(run, step, inputs, call) {
  for (let n = 1; ; n += 1) {
    const start = run.now()
    try {
      // A run already stopped starts no step: the attempt is recorded as stopped.
      if (run.signal.aborted) throw run.signal.reason ?? new Error('the brand step stopped')
      const answer = await call(structuredClone(inputs), n)
      if (answer?.value === undefined || answer?.value === null)
        throw Object.assign(new Error(`the ${step} step answered no value`), {
          code: STEP_CHAIN_NO_OUTPUT,
          usd: answer?.usd,
          knownUsd: answer?.knownUsd
        })
      run.record.push({
        step,
        attempt: n,
        startMs: start - run.t0,
        endMs: run.now() - run.t0,
        ...spendOf(answer),
        outcome: 'done',
        inputs: recordedInputs(inputs),
        output: recordedValue(answer.value)
      })
      return { value: answer.value }
    } catch (error) {
      const stopped = run.signal.aborted
      const last = stopped || error?.noRerun === true || n >= STEP_CHAIN_ATTEMPTS
      const line = {
        step,
        attempt: n,
        startMs: start - run.t0,
        endMs: run.now() - run.t0,
        ...spendOf(error),
        outcome: stopped ? 'stopped' : last ? 'failed' : 'failed, re-running',
        ...(typeof error?.code === 'string' ? { code: error.code } : {}),
        error: messageOf(error),
        ...detailsOf(error),
        inputs: recordedInputs(inputs),
        output: recordedValue(error?.value ?? null)
      }
      run.record.push(line)
      if (last) {
        const { code, error: said, details, inputs: given, output } = line
        return {
          stop: {
            step,
            attempts: n,
            ...(code ? { code } : {}),
            error: said,
            ...(details !== undefined ? { details } : {}),
            inputs: given,
            output
          }
        }
      }
    }
  }
}

/** The spend of the record: unknown (`null`, with the known part) when any line's spend is unknown. */
function spendOfRecord(record) {
  const known = record.reduce((sum, l) => sum + (Number.isFinite(l.usd) ? l.usd : Number(l.knownUsd ?? 0)), 0)
  return record.every((l) => Number.isFinite(l.usd)) ? { usd: known } : { usd: null, knownUsd: known }
}

/**
 * @param {{steps: {kit: Function, brand: Function, dispose: Function}, briefOf: (revisionId: string) =>
 *   Promise<object | null>, now?: () => number, readJson?: (file: string) => Promise<object>}} deps `steps`: the step
 *   chain's steps (`createStepChainSteps`); `briefOf`: the stored research brief of a revision (for example
 *   `briefOfRevision` of `brand-step/brand-control.js`)
 * @returns {(input: {revisionId?: string, brief?: object, logoFile?: string, kitRef: string, siteLanguage?: string, signal?: AbortSignal}) =>
 *   Promise<{record: object, records: object[], usd: number | null, knownUsd?: number, prompt: object, runId: string}>}
 * @throws {BrandStepError} `brand_step_failed` (`noRerun`: its attempts are spent) with the record and the stop report
 */
export function createBrandBeforeSite({ steps, briefOf, now = Date.now, readJson }) {
  const read = readJson ?? (async (file) => JSON.parse(await readFile(file, 'utf8')))
  return async function brandBeforeSite({
    revisionId,
    brief: given,
    logoFile,
    kitRef,
    siteLanguage,
    signal
  }) {
    if (!kitRef) throw new TypeError('the brand step needs a kit')
    if (revisionId && (given || logoFile))
      throw new TypeError('the brand step takes a research revision or a brief, not both')
    if (!revisionId && !given) throw new TypeError('the brand step needs a research revision or a brief')
    const brief = given ?? (await briefOf(revisionId))
    if (!brief)
      throw Object.assign(new Error(`no research brief for revision ${revisionId}`), {
        code: 'brief_missing'
      })
    // What the record lines say about the input: its kind and name, never the brief itself.
    const source = revisionId
      ? { kind: 'revision', revisionId }
      : { kind: 'brief-file', logo: logoFile ? 'file' : 'none' }
    sequence += 1
    // A run id of its own, so the step's files and record never mix with a build's.
    const runId = `brand-before-site-${now()}-${sequence}`
    const halt = signal ?? new AbortController().signal
    const ctx = {
      runId,
      contract: { id: kitRef },
      brief: revisionId
        ? { researchRevisionId: revisionId }
        : { researchBrief: given, ...(logoFile ? { logoFile } : {}) },
      normalized: siteLanguage ? { languages: [siteLanguage] } : {},
      signal: halt
    }
    const run = { now, t0: now(), signal: halt, record: [] }
    const how = (attempt) => ({ signal: halt, attempt })
    try {
      const kit = await attemptStep(run, 'kit', {}, (inputs, n) => steps.kit(ctx, inputs, how(n)))
      const brand = kit.stop
        ? kit
        : await attemptStep(run, 'brand', { kit: kit.value, source }, async (inputs, n) => {
            const ran = await steps.brand(ctx, inputs, how(n))
            const file = ran?.value?.file
            if (!file) return ran
            // Reading the file is part of the attempt: a failure keeps the spend of the run that wrote it.
            try {
              const record = brandLookOf({ brandFile: await read(file), brief, kit: kit.value })
              return { ...ran, value: { file, record } }
            } catch (error) {
              throw Object.assign(error, { usd: ran.usd, knownUsd: ran.knownUsd, value: { file } })
            }
          })
      if (brand.stop)
        throw new BrandStepError(
          'brand_step_failed',
          `the ${brand.stop.step} step stopped: ${brand.stop.error}`,
          { records: run.record, stop: brand.stop },
          { noRerun: true }
        )
      const record = brand.value.record
      return { record, records: run.record, ...spendOfRecord(run.record), prompt: BRAND_STEP_PROMPT, runId }
    } finally {
      await steps.dispose({ runId, chain: run.record })
    }
  }
}
