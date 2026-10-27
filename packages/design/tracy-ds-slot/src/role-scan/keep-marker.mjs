/**
 * The manual keep marker: a template author (or the agent) writes `/* ds-keep: <reason> *\/` (CSS),
 * `{/* ds-keep: <reason> *\/}` (JSX) or `<!-- ds-keep: <reason> -->` (HTML, Astro, PHP) and the scan
 * reports the value as `keep` with that reason, which VARS-1 accepts as handled. PURE.
 *
 * Where it counts: on the value's own line; on the line just above, when that line holds only the
 * marker; and for a stylesheet rule, before its selector or anywhere in its block (the whole rule).
 * A marker with no reason keeps nothing: VARS-1 needs the reason.
 */
const MARK = /ds-keep:([^\n]*?)\s*(?:\*\/|-->|$)/

/** The marker's reason in a piece of text: a string (possibly empty), or null when there is none. */
export const markerIn = (text) => {
  const m = MARK.exec(text ?? '')
  return m ? m[1].replace(/\*\/\s*\}?\s*$/, '').trim() : null
}
const onlyMarker = (line) =>
  /^\s*(\{?\s*\/\*\s*ds-keep:[^\n]*\*\/\s*\}?|<!--\s*ds-keep:[^\n]*-->)\s*$/.test(line)

/**
 * @param {string} text the whole file @param {number} at the value's offset
 * @param {boolean} cssRule the value sits in a stylesheet rule (its block and selector count)
 * @returns {string | null} the reason ('' for a marker without one), or null: no marker
 */
export function keepMarkerAt(text, at, cssRule) {
  if (!text.includes('ds-keep:')) return null
  const ls = text.lastIndexOf('\n', at - 1) + 1
  const le = text.indexOf('\n', at)
  const own = markerIn(text.slice(ls, le === -1 ? text.length : le))
  if (own !== null) return own
  const pe = ls - 1
  if (pe > 0) {
    const prev = text.slice(text.lastIndexOf('\n', pe - 1) + 1, pe)
    if (onlyMarker(prev)) return markerIn(prev)
  }
  if (!cssRule) return null
  // the block around the value, and the selector before it
  let depth = 0
  let open = -1
  for (let i = at - 1; i >= 0; i--) {
    if (text[i] === '}') depth++
    else if (text[i] === '{') {
      if (!depth) {
        open = i
        break
      }
      depth--
    }
  }
  if (open === -1) return null
  let close = text.length
  depth = 0
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      if (!depth) {
        close = i
        break
      }
      depth--
    }
  }
  let ps = open - 1
  while (ps >= 0 && !'{};'.includes(text[ps])) ps--
  return markerIn(text.slice(ps + 1, open)) ?? markerIn(text.slice(open + 1, close))
}
