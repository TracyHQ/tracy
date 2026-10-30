/**
 * The copy-plan stage's final check (spec TracyHQ/tracy#189, site build rule 3; `brief-engines/copy-plan-stage.js`).
 *
 * 🔒 A LINE THE DEMO FILLED THAT THE BUILD LEFT EMPTY OR UNWRITTEN IS A FINDING, NEVER CLEAN. The served pages cannot tell
 * an emptied line from one the template never had, so the leftover check read a blanked line as clean (R12: 99 findings
 * while 138 demo lines had been emptied and 286 fact fields with them). The engine keeps on its row which demo-filled lines
 * it emptied ("blanked") and which it never wrote because a call was lost ("unwritten", with the rule the line is written
 * by); each becomes a finding here, for the repair loop to write. CMS-neutral: any engine that records `copyLines`.
 */

/**
 * @param {{copyLines?: {unwritten?: Array<{key: string, reason?: string, rule?: string}>, blanked?: string[]} | null}} input
 * @returns {Array<{kind: 'unwritten' | 'blanked', severity: 'major', key: string, reason?: string, writeAs?: string, why: string}>}
 */
export function checkCopyLines({ copyLines = null } = {}) {
  if (!copyLines || typeof copyLines !== 'object') return []
  /** @type {Array<{kind: 'unwritten' | 'blanked', severity: 'major', key: string, reason?: string, writeAs?: string, why: string}>} */
  const out = []
  const seen = new Set()
  for (const line of Array.isArray(copyLines.unwritten) ? copyLines.unwritten : []) {
    if (!line?.key || seen.has(line.key)) continue
    seen.add(line.key)
    out.push({
      kind: 'unwritten',
      severity: 'major',
      key: line.key,
      ...(line.reason ? { reason: line.reason } : {}),
      // `rule` is the registry id the receipt adds (`withRule`): the line's own rule text travels as `writeAs`.
      ...(line.rule ? { writeAs: line.rule } : {}),
      why: `A demo line was never written (${line.reason ?? 'pending'}): ${line.key}, to be written as ${line.rule ?? 'its demo shape'}`
    })
  }
  for (const key of Array.isArray(copyLines.blanked) ? copyLines.blanked : []) {
    if (typeof key !== 'string' || seen.has(key)) continue
    seen.add(key)
    out.push({
      kind: 'blanked',
      severity: 'major',
      key,
      why: `A line the demo filled was left empty: ${key}`
    })
  }
  return out
}
