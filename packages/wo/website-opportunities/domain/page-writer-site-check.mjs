// The site check of the page writer (ticket #594, ADR 0042 W06 and W09): pages are written in parallel, so what one
// page says cannot be held against another until both are written. This check reads the written copy of every page
// together and finds:
//   repeated_copy          a sentence that repeats, or nearly repeats, one written earlier on the site (the shared
//                          rule of `copy-repeats.mjs`: five words in a row, or the same sentence of three words or more;
//                          a run inside a business value, such as the address, is no repeat);
//   seo_title_not_unique   a page title another page already has.
// The earlier one is kept and the later one is the offender, in page order: so the page that repeats is the page that
// is rewritten, by the writer's own one rewrite (`page-writer.mjs`). Pure.
import { repeatsOf } from './copy-repeats.mjs'
import { PageWriterError, knownValuesOf } from './page-writer-fields.mjs'
import { planDataOf } from './plan-data.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const titleKey = (title) => title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/** The texts of one written page the repeat rule reads: its written copy fields and its search description. */
function entriesOf(page) {
  const entries = list(page.fields)
    .filter((f) => f.from === 'writer' && isText(f.value))
    .map((f) => ({ page: page.id, key: f.key, where: `${page.id}: ${f.key}`, text: f.value }))
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
 * @param {{known?: string[], own?: Set<string>}} [options] `known`: every value of the plan data; `own`: the pages that
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
  for (const { entry, hit } of repeatsOf(list(pages).flatMap(entriesOf), { facts: known }))
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
