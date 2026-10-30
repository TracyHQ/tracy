/**
 * 🔒 EVERY LINE A BUILD COULD NOT WRITE IS TRACED (spec TracyHQ/tracy#189, R14): the copy receipt only counted the lines
 * left refused, complaint-unmet or unwritten (25 and 44 in R14), so none could be traced to a page, a writer or a check.
 * Each now carries its page, its slot key, the writer that held it last (page writer, sibling-list writer, record-page
 * writer, offering writer, call-to-action band writer), the reason, the check that failed and the model's last text, cut
 * to `TRACE_TEXT_MAX` characters, in a list of at most `TRACE_MAX` entries. It lives in the build record
 * (`copyLineTrace`), never on the site. CMS-neutral: any engine hands its writers' leftovers here.
 */

/** The most entries one build record keeps: a catalogue of 500 products must not fill the row. */
export const TRACE_MAX = 300
/** The most characters of a model's last text kept per entry. */
export const TRACE_TEXT_MAX = 200

/**
 * @typedef {{key: string, writer: string, reason: string, check?: string | null, text?: unknown}} TracedLine
 * @param {{lines: TracedLine[], pageOf?: (key: string) => string[]}} input - `pageOf`: the pages a slot shows on
 * @returns {Array<{page: string | null, key: string, writer: string, reason: string, check: string, text: string | null}>}
 */
export function copyLineTrace({ lines, pageOf = () => [] }) {
  const out = []
  const seen = new Set()
  for (const line of Array.isArray(lines) ? lines : []) {
    if (out.length >= TRACE_MAX) break
    if (!line?.key || seen.has(`${line.writer}|${line.key}`)) continue
    seen.add(`${line.writer}|${line.key}`)
    const text = typeof line.text === 'string' && line.text.trim() ? line.text.slice(0, TRACE_TEXT_MAX) : null
    out.push({
      page: pageOf(String(line.key))?.[0] ?? null,
      key: String(line.key),
      writer: String(line.writer),
      reason: String(line.reason),
      check: line.check ? String(line.check) : text === null ? 'no-answer' : 'unknown',
      text
    })
  }
  return out
}
