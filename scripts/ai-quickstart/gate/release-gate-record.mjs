// The check record of a release gate run whose marker test could not finish (ticket #586): the marker build or the
// write threw before any page was read, so there is nothing to classify. The record is made by the same
// `checkRecord`, from an empty build: no write, no render, an accounting that explains nothing, so its verdict fails
// on every part the marker test owns, and the run's other measurements are still laid in (`record-measured.mjs`).
// Pure.
import { checkRecord } from './record.mjs'

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
