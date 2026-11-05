// What the write step leaves out and what its look guard found, as the report says them (ADR 0044, decision 26). An item with
// nothing to write to (a slot the kit or the site does not have, a picture frame with no slot) is not sent: its line reads
// `refused` with the reason and the step that owns the value. A value the guard found fault with was sent all the same: its line
// keeps the finding in `guard`. The site check blocks on both (site-check/write-findings.js); read-back leaves an unaddressable
// line to it, so the fault is blamed once and on the owning step.
import { ownerStep, stepName, WRITE_STEP } from '../lib/site-build-steps.js'
import { lineId } from './last-report.js'

/**
 * Each item once, with the step at fault: the one given, else the step that owns the value, else the write step.
 * @param {{ slot: string, key?: string | null, owner?: string | null, reason: string, step?: number, part?: string,
 *   spot?: string }[]} items
 */
export function unaddressableOf(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const id = `${lineId(item)} ${item.key ?? ''}`
    if (seen.has(id)) continue
    seen.add(id)
    const step = item.step ?? ownerStep(item.owner) ?? WRITE_STEP
    out.push({
      slot: item.slot,
      key: item.key ?? null,
      owner: item.owner ?? null,
      step,
      stepName: stepName(step),
      reason: item.reason,
      ...(item.part ? { part: item.part } : {}),
      ...(item.spot ? { spot: item.spot } : {})
    })
  }
  return out
}

/** A line nothing was sent for: it is the item's own line from here on. */
const isUnsent = (line) => line.status === 'skipped' || line.status === 'failed'

/**
 * The lines with each unaddressable item said as refused: a line of the item that nothing was sent for takes its words, and an
 * item with no line gets one. A line the run did write or hide stays as it is (the item is still in `report.unaddressable`).
 */
export function withUnaddressable(lines, items) {
  if (!items.length) return lines
  const out = [...lines]
  for (const item of items) {
    const tag = { step: item.step, stepName: item.stepName }
    const at = out.findIndex((line) => lineId(line) === lineId(item) || (item.key && line.key === item.key))
    if (at >= 0) {
      if (isUnsent(out[at]))
        out[at] = { ...out[at], status: 'refused', reason: item.reason, unaddressable: tag }
      continue
    }
    out.push({
      slot: item.slot,
      key: item.key,
      owner: item.owner,
      status: 'refused',
      reason: item.reason,
      readBack: null,
      ...(item.part ? { part: item.part } : {}),
      ...(item.spot ? { spot: item.spot } : {}),
      unaddressable: tag
    })
  }
  return out
}

/** The lines with what the look guard found on each, by the content map key or the slot the finding names. */
export function withGuardFindings(lines, findings) {
  if (!findings.length) return lines
  return lines.map((line) => {
    const found = findings.filter((f) => f.what === line.key || f.what === line.slot)
    if (!found.length) return line
    return {
      ...line,
      guard: found.map(({ step, stepName: name, reason, sent }) => ({ step, stepName: name, reason, sent }))
    }
  })
}
