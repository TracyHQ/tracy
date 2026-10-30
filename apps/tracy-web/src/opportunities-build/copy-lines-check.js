/**
 * The copy-plan stage's final check (spec TracyHQ/tracy#189, site build rule 3; `brief-engines/copy-plan-stage.js`).
 *
 * 🔒 A LINE THE DEMO FILLED THAT THE BUILD LEFT EMPTY OR UNWRITTEN IS A FINDING, NEVER CLEAN. The served pages cannot tell
 * an emptied line from one the template never had, so the leftover check read a blanked line as clean (R12: 99 findings
 * while 138 demo lines had been emptied and 286 fact fields with them). The engine keeps on its row which demo-filled lines
 * it emptied ("blanked") and which it never wrote because a call was lost ("unwritten", with the rule the line is written
 * by); each becomes a finding here, for the repair loop to write. CMS-neutral: any engine that records `copyLines`.
 */

/** A page's visible words, for finding a demo line still served. */
const servedText = (/** @type {string} */ html) =>
  ` ${String(html ?? '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()} `

/**
 * 🔒 THE ROW IS READ AGAINST THE SERVED PAGES (R12 group A): the rule is a blocker (`copy-lines-kept`), so a line the repair
 * loop has since written, or whose block it took off, must not hold the gate. An unwritten line that carries its demo words
 * (`sample`) stays a finding only while some served page still shows them; with no pages read, or no sample, it stays. An
 * emptied line cannot be seen on a page, so it stays a finding.
 * @param {{copyLines?: {unwritten?: Array<{key: string, reason?: string, rule?: string, sample?: string}>, blanked?: string[]} | null,
 *   pages?: Array<{html?: string}> | null}} input
 * @returns {Array<{kind: 'unwritten' | 'blanked', severity: 'major', key: string, reason?: string, writeAs?: string, why: string}>}
 */
export function checkCopyLines({ copyLines = null, pages = null } = {}) {
  if (!copyLines || typeof copyLines !== 'object') return []
  const served = Array.isArray(pages) && pages.length > 0 ? pages.map((p) => servedText(p?.html ?? '')) : null
  const stillServed = (/** @type {string | undefined} */ sample) => {
    const words = servedText(sample ?? '').trim()
    if (!served || words.length < 3) return true
    return served.some((text) => text.includes(words))
  }
  /** @type {Array<{kind: 'unwritten' | 'blanked', severity: 'major', key: string, reason?: string, writeAs?: string, why: string}>} */
  const out = []
  const seen = new Set()
  for (const line of Array.isArray(copyLines.unwritten) ? copyLines.unwritten : []) {
    if (!line?.key || seen.has(line.key)) continue
    seen.add(line.key)
    if (!stillServed(line.sample)) continue
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
