/**
 * The third-party URLs the preview probe's browser fails at once: each measured template's contract
 * `measureBlock`, as flow.mjs fails them on the built-site run (20/10/2026).
 *
 * The live frame (probe 10) runs the page's scripts, so a parser-blocking script whose host hangs stops the
 * page at that line. JA Restaurant 1.0.6's home page loads OpenTable's reservation form through
 * `<script src="//secure.opentable.com/frontdoor/…">`: under the live frame the home page stayed at
 * readyState `loading` for over 15 minutes and no page after it was measured. The contract already names that
 * host for the built-site run (`measureNote`: the form paints with OpenTable's own stylesheet, so it would not
 * follow a system anyway); the preview probe reads the same list.
 */

/**
 * @param {Array<{ measureBlock?: unknown } | null | undefined>} contracts the measured templates' contracts
 * @returns {string[]} every URL pattern they name, once each, in first-seen order
 */
export function measureBlockOf(contracts) {
  const out = new Set()
  for (const c of contracts)
    for (const x of Array.isArray(c?.measureBlock) ? c.measureBlock : [])
      if (typeof x === 'string' && x.length > 0) out.add(x)
  return [...out]
}
