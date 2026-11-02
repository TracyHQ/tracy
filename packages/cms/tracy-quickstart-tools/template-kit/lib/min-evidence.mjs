// A measured list minimum as template-kit.json states it, derived again from the measured counts every time the
// kit is assembled, so evidence measured under an older rule follows the current one.
import { minOfCounts } from './rows.mjs'

/** The count, whether every count from it to the maximum is right, and the DOM checks per count. */
export function measuredMin(m) {
  const { min, layoutOkContiguous } = minOfCounts(m.okCounts, m.max)
  return {
    min,
    minSource: 'measured',
    // How a short last line sits: `fills`, `centers`, or `left-packed` (and the minimum once centered).
    ...(m.sparseRow ? { sparseRow: m.sparseRow, minIfCentered: m.minIfCentered ?? null } : {}),
    minEvidence: {
      layoutOkAt: m.okCounts,
      layoutOkContiguous,
      checks: Object.fromEntries(
        Object.entries(m.checks ?? {}).map(([n, byW]) => [
          n,
          Object.fromEntries(Object.entries(byW).map(([w, c]) => [w, c.reason]))
        ])
      ),
      faithfulness: m.faithfulness
    }
  }
}

/**
 * Why a list has no minimum. Measured but no count right: the template leaves a hole at every count (a real defect,
 * named with how the short row sits); not measured: the rows could not be found, a limit of the measurement.
 */
export function noMinReason(measured, max) {
  if (!measured?.checks) return 'no set of item rows on the page could be measured'
  const upTo = measured.max ?? max
  if (measured.sparseRow === 'left-packed')
    return `every count from 1 to ${upTo} leaves a hole at desktop width: the template packs a short last row to the left${measured.minIfCentered != null ? ` (min ${measured.minIfCentered} once centered)` : ''}`
  return `every count from 1 to ${upTo} was measured and none lays out without a hole`
}
