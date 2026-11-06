// What the check command prints: one line per group, one per failure, and the verdict last.
import { stepName } from '../lib/site-build-steps.js'

const LONGEST = 160
const shown = (value) => {
  if (value === null || value === undefined) return '(nothing)'
  const text = JSON.stringify(value)
  return text.length > LONGEST ? `${text.slice(0, LONGEST)}...` : text
}

const readsOf = (reads) =>
  reads?.length ? ` reads: ${reads.map((r) => `${r.read} (${r.lines})`).join(', ')}` : ''

function groupLine(g) {
  const size = g.status === 'not-run' ? '' : ` ${g.checked ?? 0} checked`
  const skipped = g.skipped ? `, ${g.skipped} skipped` : ''
  const why = g.reason ? ` (${g.reason})` : ''
  const despite = g.ranDespite ? ` (ran although ${g.ranDespite})` : ''
  return `${g.name}: ${g.status}${size}${skipped}${why}${despite}${readsOf(g.reads)}`
}

function failureLine(f) {
  const where = [
    `page=${f.page ?? '-'}`,
    `slot=${f.slot ?? '-'}`,
    ...(f.key && f.key !== f.slot ? [`key=${f.key}`] : []),
    ...(f.width ? [`width=${f.width}`] : [])
  ]
  const order = f.ordered === undefined || f.ordered === null ? '' : ` ordered=${shown(f.ordered)}`
  const words = f.reason ? `: ${f.reason}` : ''
  return `  ${f.level} step ${f.causingStep} (${stepName(f.causingStep)}) ${where.join(' ')} measured=${shown(f.measured)}${order}${words}`
}

/** @param {object} check `site-check/1` */
export function checkLines(check) {
  return [
    ...check.groups.flatMap((g) => [groupLine(g), ...g.failures.map(failureLine)]),
    ...(check.pageGroups === false
      ? ['page groups: not run (no host was given, so no page was opened)']
      : []),
    `site-check: ${check.status} (${check.counts.block} block, ${check.counts.warn} warn, ${check.counts.unmeasured ?? 0} unmeasured${check.counts.notApplicable ? `, ${check.counts.notApplicable} not applicable` : ''})`
  ]
}
