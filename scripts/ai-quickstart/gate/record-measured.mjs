// The check record with the measurements of #586 laid in (ticket #586). The marker test makes the record as soon as
// its pages are read (`run-gate.mjs`), while write safety, structure and quality run after it on the same site; this
// puts their results into that record and settles the verdict again. The parts of the verdict the marker test and the
// demo scan own are kept as they are; the four measured parts are taken from the measurements, each passing only on
// `passed`. A site address in a measurement is replaced by `<site>`, as everywhere in the record. Pure.
import { MEASURED_PARTS, measurementsOf } from './verdict.mjs'

const siteless = (value, origin) =>
  origin
    ? JSON.parse(JSON.stringify(value ?? null).replaceAll(origin, '<site>'))
    : structuredClone(value ?? null)

/**
 * @param {object} record a `tracy-ai-quickstart-check-record/v2` document
 * @param {Record<string, object>} given the measurements of #586 the run gave (`writeSafety`, `structure`, `quality`,
 *   `secrets`); a missing one is `not_run`
 * @param {{origin?: string | null, markerTest?: object, demoScan?: object, phases?: object[], finishedAt?: string}} [more] `markerTest` and
 *   `demoScan` replace those measurements (a marker test that threw is `incomplete` with its reason); `phases`: the
 *   run's phases with their time
 */
export function withMeasurements(
  record,
  given,
  { origin = null, markerTest, demoScan, phases, finishedAt } = {}
) {
  const measured = siteless(measurementsOf(given), origin)
  const own = {
    markerTest: markerTest ?? record.measurements?.markerTest ?? { status: 'not_run' },
    demoScan: demoScan ?? record.measurements?.demoScan ?? { status: 'not_run' }
  }
  const failing = [
    ...(record.verdict?.failing ?? []).filter((p) => !MEASURED_PARTS.includes(p)),
    ...MEASURED_PARTS.filter((p) => measured[p].status !== 'passed')
  ]
  const verdict = {
    ...record.verdict,
    measurements: {
      markerTest: own.markerTest.status,
      demoScan: own.demoScan.status,
      ...Object.fromEntries(MEASURED_PARTS.map((p) => [p, measured[p].status]))
    },
    notRun: MEASURED_PARTS.filter((p) => measured[p].status === 'not_run'),
    failing,
    pass: failing.length === 0 && own.markerTest.status === 'passed' && own.demoScan.status === 'passed'
  }
  if (!verdict.pass && failing.length === 0) verdict.failing = ['markerTest']
  return {
    ...record,
    finishedAt: finishedAt ?? new Date().toISOString(),
    verdict,
    measurements: { ...own, ...measured },
    ...(phases ? { phases } : {})
  }
}
