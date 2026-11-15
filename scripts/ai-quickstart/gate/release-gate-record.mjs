// The check record of a release gate run whose marker test could not finish (ticket #586): the marker build or the
// write threw before any page was read, so there is nothing to classify. The record is made by the same
// `checkRecord`, from an empty build: no write, no render, an accounting that explains nothing, so its verdict fails
// on every part the marker test owns, and the run's other measurements are still laid in (`record-measured.mjs`).
// A run that stopped before its phases gets one too (`stoppedRecord`). Pure.
import { checkRecord } from './record.mjs'
import { withMeasurements } from './record-measured.mjs'

/**
 * @param {{kit: object, site: {origin: string}, widths: number[], themes: string[], refusals?: object[],
 *   kitHashes?: object, inputs?: object, controls?: object, startedAt: string}} input
 */
export function emptyRecord(input) {
  return checkRecord({
    kit: input.kit,
    origin: input.site.origin,
    built: { gaps: [], orderProblems: [], writePlan: null, written: null },
    accounting: { counts: { unexplained: null }, places: [] },
    real: null,
    renders: [],
    pages: [],
    classified: { findings: [], notSeen: [], exempt: [], seen: new Set(), problems: [] },
    groups: [],
    demo: { browser: [], html: [], checks: [] },
    controls: input.controls ?? {},
    widths: input.widths ?? [],
    themes: input.themes ?? [],
    plugin: null,
    refusals: input.refusals ?? [],
    kitHashes: input.kitHashes,
    inputs: input.inputs,
    startedAt: input.startedAt
  })
}

/**
 * The record of a run that stopped before its phases (the blank site step, the kit, the site session threw): every
 * measurement `incomplete` with the stage and the reason, so the run still leaves a record that fails, never none.
 * @param {{kit?: object | null, inputs?: object, kitHashes?: object, startedAt: string, stage: string, error: unknown}}
 *   input
 */
export function stoppedRecord({ kit, inputs, kitHashes, startedAt, stage, error }) {
  const why = {
    status: 'incomplete',
    reason: 'run_stopped',
    stage,
    code: String(error?.code ?? 'error'),
    message: String(error?.message ?? error).slice(0, 400)
  }
  const base = emptyRecord({
    kit: kit ?? { ref: null },
    site: { origin: 'http://site.invalid' },
    inputs,
    kitHashes,
    startedAt
  })
  const given = { writeSafety: why, structure: why, quality: why, secrets: why }
  return withMeasurements(base, given, { markerTest: why, demoScan: why })
}
