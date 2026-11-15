// How write safety classes what happened to a probe (ticket #586, product decisions 1 and 2):
//   server_error      the site answered an error (a door call or a page): fails the gate
//   door_refused      the plugin refused a value a customer could type, or kept another one: fails the gate
//   refused_by_build  one of the build's own named guards refused it before any site saw it: recorded only
//   markup_injected   a page prints the value as a live element or runs it as a code: fails the gate
// Pure.
import { parseHTML } from 'linkedom'
import { codesIn } from './marker-codec.mjs'

/** The kinds that fail write safety. */
export const FAILING = new Set(['server_error', 'door_refused', 'markup_injected'])

/** The causes of a door call that mean the site itself failed, not a refusal it gave (`site-doors-send.mjs`). */
const SERVER_CAUSES = /^(?:not_json|server_error|internal_error|no_answer|http_5\d\d)$/i

/**
 * The class of a stopped write (`runDraftWrite` report or error): a door call that failed after its retries
 * (`redo_failed`, its `cause` the door's code), a read back the site answered otherwise, or a guard of the write step.
 * @param {{code?: string, details?: object}} report
 * @returns {{kind: string, code: string, cause: string | null, op: string | null}}
 */
export function stopClassOf(report) {
  const code = String(report?.code ?? 'stopped')
  const cause = report?.details?.cause != null ? String(report.details.cause) : null
  const op = report?.details?.op ?? report?.details?.record ?? null
  if (code === 'redo_failed')
    return { kind: SERVER_CAUSES.test(cause ?? '') ? 'server_error' : 'door_refused', code, cause, op }
  if (code === 'read_back_mismatch') return { kind: 'door_refused', code, cause, op }
  return { kind: 'refused_by_build', code, cause, op }
}

/** The class of a gap the memory write met that the plain build did not (`marker-gaps.mjs`). */
export const gapClassOf = (gap) =>
  gap.code === 'redo_failed' || gap.code === 'read_back_mismatch'
    ? { kind: 'door_refused', code: gap.code, cause: gap.cause ?? null, op: gap.record, site: 'memory' }
    : { kind: 'refused_by_build', code: gap.code, cause: gap.cause ?? null, op: gap.record }

/** A gap's identity, to compare a probed build with the plain one. */
export const gapKey = (gap) => gap.code + '|' + gap.record

/**
 * What a build refused on its own before any site: it threw, its write order has problems, or the memory write met
 * a gap the plain build did not. Null when nothing.
 * @param {{built?: object, error?: Error}} attempt
 * @param {Set<string>} plainGaps
 */
export function buildRefusalOf({ built, error }, plainGaps) {
  if (error)
    return { kind: 'refused_by_build', code: String(error.code ?? 'build_failed'), cause: null, op: null }
  if (built?.orderProblems?.length) {
    const p = built.orderProblems[0]
    return { kind: 'refused_by_build', code: String(p.code), cause: null, op: null, at: p.at ?? null }
  }
  const extra = (built?.gaps ?? []).find((g) => !plainGaps.has(gapKey(g)))
  return extra ? gapClassOf(extra) : null
}

/**
 * The probes a page shows as a live element, among the probed places whose code it prints.
 * @param {string} html
 * @param {Map<string, {code: string, probe: object}>} used
 * @returns {{shown: Set<string>, injected: Array<{place: string, judged: object}>}}
 */
export function judgePage(html, used) {
  const text = String(html ?? '')
  const codes = new Set(codesIn(text))
  const shown = new Set()
  const injected = []
  let doc = null
  for (const [place, { code, probe }] of used) {
    if (
      !codes.has(String(code).toUpperCase()) &&
      !text.toLowerCase().includes('qx' + String(code).toLowerCase())
    )
      continue
    shown.add(place)
    doc ??= parseHTML(text).document
    const judged = probe.judge?.({ doc, code, html: text }) ?? null
    if (judged) injected.push({ place, judged })
  }
  return { shown, injected }
}
