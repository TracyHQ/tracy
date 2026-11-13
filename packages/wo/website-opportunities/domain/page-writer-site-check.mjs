// The site check of the page writer (ticket #594, ADR 0042 W06 and W09): pages are written in parallel, so what one
// page says cannot be held against another until both are written. This check reads the written copy of every page
// together and finds:
//   repeated_copy          a sentence that repeats, or nearly repeats, one written earlier on the site (the shared
//                          rule of `copy-repeats.mjs`: five words in a row, or the same sentence of three words or more;
//                          a run inside a business value, such as the address, is no repeat, nor a sentence that is a
//                          business value plus four other words at most; a label (a button, a menu entry, a field of
//                          40 characters or less, a heading of four words or less) may be the same whole sentence on
//                          every page, a body sentence may not);
//   seo_title_not_unique   a page title another page already has.
// The earlier one is kept and the later one is the offender, in page order: so the page that repeats is the page that
// is rewritten, by the writer's own one rewrite (`page-writer.mjs`). Pure.
import { repeatsOf } from './copy-repeats.mjs'
import { PageWriterError, knownValuesOf } from './page-writer-fields.mjs'
import { planDataOf } from './plan-data.mjs'
import { titleKey } from './seo-limits.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Labels: a button, a menu entry, a short badge, any field of at most this many characters. */
const LABEL_LIMIT = 40
const LABEL_KIND = /(?:button|menu|newsletter|cta|social|map)_label$|\.badge$/
const HEADING_KIND = /\.heading$|\.tagline$/
const HEADING_WORDS = 4
/** A label may be the same whole sentence on every page ("Book now", "Contact us today"); five words in a row still repeat. */
const isLabel = (entry, words) =>
  (Number.isInteger(entry.limit) && entry.limit <= LABEL_LIMIT) ||
  (typeof entry.kind === 'string' && LABEL_KIND.test(entry.kind)) ||
  (words.length <= HEADING_WORDS &&
    (typeof entry.kind === 'string' ? HEADING_KIND.test(entry.kind) : !/[.!?]\s*$/.test(entry.text)))
/** Other words a sentence made of a business value may have and still be no repeat ("Visit us at <address>."). */
const FACT_SLACK = 4

/** The texts of one written page the repeat rule reads: its written copy fields and its search description. */
function entriesOf(page) {
  const entries = list(page.fields)
    .filter((f) => f.from === 'writer' && isText(f.value))
    .map((f) => ({
      page: page.id,
      key: f.key,
      kind: f.kind,
      limit: f.limit,
      where: `${page.id}: ${f.key}`,
      text: f.value
    }))
  if (isText(page.seo?.description))
    entries.push({
      page: page.id,
      key: 'seo.description',
      where: `${page.id}: seo.description`,
      text: page.seo.description
    })
  return entries
}

/**
 * The fields of the written pages that fail the site check.
 * @param {Array<{id: string, fields?: object[], seo?: {title?: string, description?: string}}>} pages the written
 *   pages in page order: the copy of pages written before (`others`) first, then the pages being written
 * @param {{known?: Array<string | {value: string}>, own?: Set<string>}} [options] `known`: every value of the plan
 *   data; `own`: the pages that
 *   may be rewritten (all when not given): a field of another page is never reported
 * @returns {Array<{page: string, key: string, value: string, problems: Array<{code: string, message: string}>}>}
 */
export function siteCopyFailing(pages, { known = [], own } = {}) {
  const failing = new Map()
  const fail = (page, key, value, problem) => {
    if (own && !own.has(page)) return
    const at = `${page}|${key}`
    if (!failing.has(at)) failing.set(at, { page, key, value, problems: [] })
    failing.get(at).problems.push(problem)
  }
  const facts = list(known)
    .map((k) => (typeof k === 'string' ? k : k?.value))
    .filter(isText)
  for (const { entry, hit } of repeatsOf(list(pages).flatMap(entriesOf), {
    facts,
    short: isLabel,
    factSlack: FACT_SLACK
  }))
    if (hit)
      fail(entry.page, entry.key, entry.text, {
        code: 'repeated_copy',
        message: `"${hit.run}" repeats ${hit.other.where}: say it in other words, every sentence of the site is its own`
      })
  const titles = new Map()
  for (const page of list(pages)) {
    if (!isText(page.seo?.title)) continue
    const key = titleKey(page.seo.title)
    if (titles.has(key))
      fail(page.id, 'seo.title', page.seo.title, {
        code: 'seo_title_not_unique',
        message: `page ${titles.get(key)} has the same title: every page has its own title`
      })
    else titles.set(key, page.id)
  }
  return [...failing.values()]
}

/**
 * For the step chain, which runs one writer step per page in parallel: the site check over every written page, as a
 * typed error `site_copy_failed` (not `noRerun`) naming the pages to write again, or null when the site passes. A page
 * named is re-run once, with the other pages' copy as `others` of `writePages`, so its own rewrite fixes the repeat.
 * @param {{pages: object[], profile: object}} input the written pages in page order, and the approved profile
 */
export function siteCopyError({ pages, profile }) {
  const data = planDataOf(profile)
  const failing = siteCopyFailing(pages, { known: knownValuesOf(data.byId, data.rowsById) })
  if (failing.length === 0) return null
  const ids = [...new Set(failing.map((f) => f.page))]
  return new PageWriterError(
    'site_copy_failed',
    `${failing.length} field(s) repeat another page or share its title, on page(s) ${ids.join(', ')}`,
    {
      pages: ids,
      failing: failing.slice(0, 20).map(({ page, key, problems }) => ({
        page,
        key,
        problems: [...new Set(problems.map((p) => p.code))].map((code) => ({ code }))
      })),
      failingCount: failing.length
    }
  )
}
