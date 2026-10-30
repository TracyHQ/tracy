/**
 * 🔒 ONE RULE FOR A SHORT TEXT THE FILL STAGE REFUSES (#189, COO 30/10/2026: "fix the stage, not one validator at a time").
 *
 * A label, heading or short line the model wrote (or translated) that fails its check (empty, too long, a demo or generic
 * word, a duplicate) never stops the build. It takes the first deterministic value from the brief that passes the same
 * check (the page title, the offering name, the business name, ...), and the swap is recorded for the build receipt.
 * When no value passes, the text is a blocker `finding`: the caller leaves that one item as it is (or out) and the final
 * check reads the served page. Only an error that means the site itself would be broken (a missing page, a refused write,
 * a door that does not answer) may still stop a build; that is the caller's business, never this helper's.
 */

/**
 * Settle one short text.
 * @param {{site: string, key: string, value: unknown, invalid: (text: string) => string | null,
 *   candidates?: Array<{source: string, text: unknown}>}} input
 *   `site`: where the text goes ("footer heading", "main menu label", ...), for the receipt; `invalid`: the reason a text
 *   cannot stand, or null; `candidates`: the deterministic stand-ins, in order of preference
 * @returns {{text: string | null, fallback?: TextFallback, finding?: TextFinding}}
 */
export function settleText({ site, key, value, invalid, candidates = [] }) {
  const was = String(value ?? '').trim()
  const reason = invalid(was)
  if (!reason) return { text: was }
  for (const candidate of candidates) {
    const text = String(candidate?.text ?? '').trim()
    if (text && !invalid(text))
      return { text, fallback: { site, key, was, reason, source: candidate.source, text } }
  }
  return { text: null, finding: { site, key, was, reason, severity: 'blocker' } }
}

/**
 * The receipt lines of a stage's settled texts: one per stand-in, one blocker line per text no value could take.
 * @param {{fallbacks?: TextFallback[], findings?: TextFinding[]}} settled
 * @returns {string[]}
 */
export function textFallbackNotes({ fallbacks = [], findings = [] } = {}) {
  return [
    ...fallbacks.map(
      (f) =>
        `${f.site} ${f.key}: the model's text ${JSON.stringify(f.was)} was refused (${f.reason}); the ${f.source} ${JSON.stringify(f.text)} stands in`
    ),
    ...findings.map(
      (f) =>
        `BLOCKER ${f.site} ${f.key}: no text passes its check (${f.reason}); it is left for the final check`
    )
  ]
}

/**
 * @typedef {{site: string, key: string, was: string, reason: string, source: string, text: string}} TextFallback
 * @typedef {{site: string, key: string, was: string, reason: string, severity: 'blocker'}} TextFinding
 */
