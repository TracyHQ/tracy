// Did a pass's probe reach the site at its place (ticket #586, review round 2)? A place counts as tested only when the
// probe the pass gave it is found in what was written for it: the write plan sent through the door (the stored value
// of that place) or, failing that, the page. A build that writes the plain marker instead of the probe, or drops it,
// leaves the place untested; and a probe that never reached a page is never judged as run by the page. A probe that
// replaces the whole value (the empty value, a number) carries no code: its place is found where the plain build
// stored that place's code, and the value stored there must be the probe exactly. Pure.
import { placeKeyOf } from './universe.mjs'
import { storedOf } from './write-safety-places.mjs'

/** HTML references a store or a template may keep a value under, read once. */
const decoded = (text) =>
  String(text ?? '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')

/** The probe text as a JSON column keeps it (a settings column stores its values as JSON strings). */
const jsonForm = (text) => JSON.stringify(String(text)).slice(1, -1)

/** Whether a stored value holds the probe text: as written, escaped once for HTML, or as a JSON string keeps it. */
const holds = (stored, text) => {
  const s = String(stored ?? '')
  return [s, decoded(s)].some((v) => v.includes(text) || v.includes(jsonForm(text)))
}

/**
 * The places of a pass whose probe the write plan carries at that place.
 * @param {Map<string, {code: string, probe: object, value: string, base: string}>} used
 * @param {object} plan the pass's write plan
 * @param {Map<string, object[]>} index code to where it is stored in this plan (`storedIndex`)
 * @param {Map<string, object[]>} plainIndex the same for the plain build
 * @returns {Set<string>}
 */
export function reachedInPlan(used, plan, index, plainIndex) {
  const out = new Set()
  const byOp = new Map((plan?.ops ?? []).map((op) => [op.key, op]))
  for (const [key, u] of used) {
    const code = String(u.code).toUpperCase()
    if (u.probe.whole) {
      // No code in the value: the place is where the plain build stored this place's code.
      const at = plainIndex.get(code) ?? []
      const found = at.some((s) => {
        const op = byOp.get(s.op)
        const where = s.loc ? placeKeyOf(s.loc) : null
        return storedOf(op ?? {}).some(
          (x) => (where ? x.loc && placeKeyOf(x.loc) === where : x.entry === s.entry) && x.value === u.value
        )
      })
      const coded = String(u.value).toUpperCase().includes(code)
      if (found || (coded && (index.get(code) ?? []).some((x) => holds(x.value, u.value)))) out.add(key)
      continue
    }
    // A probe with a signature is found by it: the build may change the probe's punctuation (straight quotes made
    // curly), never its signature unless it dropped the probe. One without is found by the place's own value, its
    // marker together with the probe (review 5 Y1): a stored column (an article's text) holds several places, and the
    // same probe text at another place in it is not this place's.
    const mark = u.probe.signature?.(u.code)
    const own = String(u.value ?? '')
    if ((index.get(code) ?? []).some((s) => (mark ? holds(s.value, mark) : own && holds(s.value, own))))
      out.add(key)
  }
  return out
}

/**
 * The places of a pass whose probe a page shows, among the ones the plan did not show reached. A page is searched for
 * the place's own value, never the probe text alone (review 5 Y1): a probe with no code in its text (letters of other
 * scripts, a content plugin code, a limit pad) has the same text at every place, so one place's copy on a page would
 * credit every other place given that probe. A signature carries the place's code and stands for it; else the whole
 * probed value (the place's marker together with the probe) must show.
 */
export function reachedOnPage(html, used, already) {
  const out = new Set()
  for (const [key, u] of used) {
    if (already.has(key) || u.probe.whole) continue
    const mark = u.probe.signature?.(u.code)
    const own = String(u.value ?? '')
    if ((mark && holds(html, mark)) || (own && holds(html, own))) out.add(key)
  }
  return out
}
