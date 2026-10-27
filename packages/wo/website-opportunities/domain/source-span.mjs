/**
 * A quote's place in a source: the one check that ties a written claim to the words a source holds, shared by the
 * quality dossier's facts (`apps/tracy-web/src/opportunities-build/quality-dossier.js`) and a demo post's claims
 * (`editorial-guide.mjs`).
 *
 * 🔒 THE QUOTE IS THE SOURCE'S OWN WORDS AT ITS OWN PLACE: `source.body.slice(start, end) === quote`, with
 * integer bounds inside the body. A ref that names no bounds (`locate`) is placed at the quote's first occurrence
 * and then held to the same check, so a model never has to count characters and a quote the source does not
 * hold is refused either way.
 */

/**
 * @param {{sourceId?: unknown, start?: unknown, end?: unknown, quote?: unknown}} ref
 * @param {Array<{id: string, body: string}>} sources
 * @param {{locate?: boolean}} [options]
 * @returns {{ok: true, source: {id: string, body: string}, start: number, end: number, quote: string} | {ok: false}}
 */
export function sourceSpan(ref, sources, { locate = false } = {}) {
  const source = sources.find((s) => s.id === ref?.sourceId)
  if (!source || typeof source.body !== 'string' || typeof ref.quote !== 'string' || ref.quote === '')
    return { ok: false }
  let { start, end } = ref
  if (locate && start === undefined && end === undefined) {
    start = source.body.indexOf(ref.quote)
    end = start + ref.quote.length
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > source.body.length ||
    source.body.slice(start, end) !== ref.quote
  )
    return { ok: false }
  return { ok: true, source, start, end, quote: ref.quote }
}

/**
 * A research value as one text a quote is found in: every string and number it holds, in its own order, one per
 * line. The same value always gives the same text, so a span found once holds on every later check.
 * @param {unknown} value
 */
export function sourceText(value) {
  const lines = []
  const walk = (v) => {
    if (typeof v === 'string') {
      if (v.trim() !== '') lines.push(v)
    } else if (typeof v === 'number' && Number.isFinite(v)) lines.push(String(v))
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(value)
  return lines.join('\n')
}
