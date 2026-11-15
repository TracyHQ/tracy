// How write safety classes what happened to a probe (ticket #586, product decisions 1 and 2):
//   server_error      the site answered an error (a door call or a page answering other than planned): fails the gate
//   site_unreachable  the site gave no answer (a dropped connection, a page that does not answer): fails the gate
//   door_refused      the plugin refused a value a customer could type, or kept another one: fails the gate
//   refused_by_build  one of the build's own named guards refused it before any site saw it: recorded only
//   markup_injected   a page prints the value as a live element or runs it as a code: fails the gate
//   unclassified      the build threw a code it has no named guard for: the measurement cannot pass (incomplete)
// A stop is the build's own only when its code is on the list of the build team's named guards (`BUILD_GUARD_CODES`,
// read from their own error lists); every other stop of a site write is a failure of the site. Pure.
import { parseHTML } from 'linkedom'
import { DRAFT_WRITE_NO_RERUN } from '../../../packages/wo/website-opportunities/domain/draft-write-error.mjs'
import { NO_RERUN as WRITE_ORDER_CODES } from '../../../packages/wo/website-opportunities/domain/write-order-error.mjs'
import { codesIn } from './marker-codec.mjs'

/** The kinds that fail write safety. */
export const FAILING = new Set(['server_error', 'site_unreachable', 'door_refused', 'markup_injected'])

/** The codes a door run gives after its retries: a site answer, never a guard of the build. */
const SITE_CODES = new Set(['redo_failed', 'read_back_mismatch'])

/**
 * The build's own named guards: the draft write's and the write order's codes a second attempt cannot fix, less the
 * two a site gives, plus the page writer's copy check. A test fails when the build team adds a code this list misses.
 */
export const BUILD_GUARD_CODES = new Set([
  ...DRAFT_WRITE_NO_RERUN.filter((c) => !SITE_CODES.has(c)),
  ...WRITE_ORDER_CODES,
  'page_copy_check'
])

/** The causes of a door call that mean the site failed to answer at all (`site-doors-send.mjs`). */
const UNREACHABLE = /^(?:no_answer|fetch_failed|timeout|timed_out|econn\w*|socket\w*)$/i
/** The causes of a door call that mean the site itself failed, not a refusal it gave. */
const SERVER_CAUSES = /^(?:not_json|server_error|internal_error|write_failed|http_5\d\d)$/i

/**
 * The class of a stopped site write (`runDraftWrite` report or error): a door call that failed after its retries
 * (`redo_failed`, its `cause` the door's code), a read back the site answered otherwise, a named build guard, or else
 * a failure of the site (no code, a dropped connection, an error nobody named).
 * @param {{code?: string | null, details?: object}} report
 * @returns {{kind: string, code: string, cause: string | null, op: string | null}}
 */
export function stopClassOf(report) {
  const code = report?.code == null ? 'no_code' : String(report.code)
  const cause = report?.details?.cause != null ? String(report.details.cause) : null
  const op = report?.details?.op ?? report?.details?.record ?? null
  const out = (kind) => ({ kind, code, cause, op })
  if (code === 'redo_failed') {
    if (UNREACHABLE.test(cause ?? '')) return out('site_unreachable')
    if (cause == null || SERVER_CAUSES.test(cause)) return out('server_error')
    return out('door_refused')
  }
  if (code === 'read_back_mismatch') return out('door_refused')
  if (BUILD_GUARD_CODES.has(code)) return out('refused_by_build')
  return out(UNREACHABLE.test(code) ? 'site_unreachable' : 'server_error')
}

/**
 * A page that does not answer as planned: no answer (status 0), an error, or another status than the one it is planned
 * with (200, or the 404 of the missing page). Null when it answered as planned.
 * @param {{status: number}} answer
 * @param {{status?: number, expected?: number}} page
 */
export function pageBroken(answer, page) {
  const expected = page?.expected ?? page?.status ?? 200
  if (!answer || answer.status === 0 || answer.status == null)
    return { kind: 'site_unreachable', code: 'page' }
  if (answer.status >= 500 || answer.status !== expected)
    return { kind: 'server_error', code: 'page', cause: 'http_' + answer.status }
  return null
}

/** The class of a gap the memory write met that the plain build did not (`marker-gaps.mjs`). */
export const gapClassOf = (gap) => {
  if (SITE_CODES.has(gap.code))
    return { kind: 'door_refused', code: gap.code, cause: gap.cause ?? null, op: gap.record, site: 'memory' }
  const kind = BUILD_GUARD_CODES.has(gap.code) ? 'refused_by_build' : 'unclassified'
  return { kind, code: gap.code, cause: gap.cause ?? null, op: gap.record, details: gap.details ?? null }
}

/** A gap's identity, to compare a probed build with the plain one. */
export const gapKey = (gap) => gap.code + '|' + gap.record

/**
 * What a build refused on its own before any site: it threw, its write order has problems, or the memory write met
 * a gap the plain build did not. Null when nothing. A throw whose code is no named guard is `unclassified`.
 * @param {{built?: object, error?: Error}} attempt
 * @param {Set<string>} plainGaps
 */
export function buildRefusalOf({ built, error }, plainGaps) {
  if (error) {
    const code = error.code == null ? 'no_code' : String(error.code)
    const kind = BUILD_GUARD_CODES.has(code) ? 'refused_by_build' : 'unclassified'
    return { kind, code, cause: null, op: null, details: error.details ?? null }
  }
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
