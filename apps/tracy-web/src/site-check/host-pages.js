// The page groups' one shared read: every kept page of the site opened by the host (it has the browser; tracy-web has none),
// at 1440 and at 390, and judged by the host's `demo-qa` measures. The groups below all read this one answer.
//
// A site goes to the host in several calls (lib/page-chunks.js).
import { GroupUnmeasured } from './group-unmeasured.js'
import { forHost } from './demo-baseline.js'
import { callPages, CALL_BUDGET_MS, CALL_TIMEOUT_MS, chunksOf } from '../lib/page-chunks.js'
import { pagePath } from '../lib/hidden-page-links.js'
import { keptPaths } from '../lib/site-kept-paths.js'

export const WIDTHS = [1440, 390]
const IMAGE = /\.(?:jpe?g|png|webp|gif|svg|avif)(?:#|\?|$)/i

/** An address or a piece of markup a run wrote: the slug of a kept demo route in one must not read as the customer's word. */
const NOT_WORDS = /^(?:\/|#|<|index\.php|[a-z][a-z0-9+.-]*:)/i

/** What the write step wrote, as the host judges it: its words are the brief's, its picture files are Tracy's own. */
export function writtenWords(report) {
  const written = (report.slots ?? []).filter((s) => s.status === 'written' && typeof s.ordered === 'string')
  return {
    briefProse: written
      .map((s) => s.ordered)
      .filter((value) => !IMAGE.test(value) && !NOT_WORDS.test(value.trim()))
      .join('\n'),
    placed: written
      .filter((s) => IMAGE.test(s.ordered))
      .map((s) => s.ordered.split('#')[0].replace(/^\/+/, ''))
  }
}

/** The host's verdicts of the calls, one per id: failed if any call failed, findings of all of them, skipped if any skipped. */
function mergeChecks(answers) {
  const merged = new Map()
  for (const check of answers.flatMap((a) => a.checks)) {
    const was = merged.get(check.id)
    merged.set(
      check.id,
      was
        ? {
            ...was,
            pass: was.pass && check.pass,
            detail: [...was.detail, ...(check.detail ?? [])],
            ...(check.skipped ? { skipped: check.skipped } : {})
          }
        : { ...check, detail: [...(check.detail ?? [])] }
    )
  }
  return merged
}

async function readPages(context) {
  if (typeof context.host !== 'function')
    throw new GroupUnmeasured('No host was given, and only the host has a browser to read the pages.')
  const inspect = await context.read('content.contract', { operation: 'inspect' })
  const only = context.pages ? new Set(context.pages.map((p) => pagePath(p))) : null
  const paths = keptPaths(inspect, context.report).filter((p) => !only || only.has(pagePath(p)))
  if (!paths.length) throw new GroupUnmeasured('The site lists no page, so there was nothing to open.')
  const words = writtenWords(context.report)
  const answers = []
  for (const chunk of chunksOf(paths)) {
    const body = await context.host({
      ...callPages(chunk),
      discover: false,
      measurePages: true,
      budgetMs: CALL_BUDGET_MS,
      timeoutMs: CALL_TIMEOUT_MS,
      briefProse: words.briefProse,
      briefText: words.briefProse,
      placed: words.placed,
      ...(context.baseline ? { baseline: forHost(context.baseline) } : {})
    })
    if (!Array.isArray(body?.checks))
      throw new GroupUnmeasured(`The host gave no verdicts: ${body?.code ?? body?.error ?? 'no answer'}`)
    answers.push(body)
  }
  const measures = answers.flatMap((a) => (Array.isArray(a.pageMeasures) ? a.pageMeasures : []))
  return {
    paths,
    calls: answers.length,
    checks: mergeChecks(answers),
    visited: answers.flatMap((a) => (Array.isArray(a.visited) ? a.visited : [])),
    measures,
    hasMeasures: answers.every((a) => Array.isArray(a.pageMeasures))
  }
}

const memo = new WeakMap()
/** The pages' read, made once for the whole check: every page group asks for it and gets the same answer. */
export function pagesRead(context) {
  if (!memo.has(context)) memo.set(context, readPages(context))
  return memo.get(context)
}
