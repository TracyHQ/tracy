// The records the pages create (ticket #597): the category every created article or contact is filed in, from the
// kit's `pages.<type>.record.category` (or, for an older kit, the `buildSets` place that reads it), and the columns the
// record starts from (`pages.<type>.record.base`). Pure; part of `writePlanOf`.
import { categoryRecordOf } from './draft-write-kit-pages.mjs'
import { unproven } from './draft-write-sink.mjs'

const FILED = ['article', 'contact']

/** The category and base columns of every created article and contact. */
export function planCategories(state) {
  const pages = state.kit.mapping.pages ?? {}
  const sets = Object.values(state.kit.mapping.buildSets ?? {}).filter((s) => s.sets === 'category')
  const types = new Set([
    ...sets.map((s) => s.pageType),
    ...Object.entries(pages)
      .filter(([, p]) => p?.record?.category)
      .map(([t]) => t)
  ])
  // The records first: a category record is added while they are walked.
  const records = [...state.sink.records.values()].filter(
    (r) => r.kind === 'created' && FILED.includes(r.recordKind)
  )
  for (const record of records) {
    const page = state.site.pageOfSubject(record.subject)
    // An article with no menu item of its own takes the home page's layout and prints nothing (measured).
    if (!page && record.recordKind === 'article')
      unproven(state.sink, 'article_without_page', { record: record.key })
    const pageType = page?.pageType ?? state.site.listedTypeOf(record.subject)
    record.pageType ??= pageType
    const decl = pages[pageType]?.record
    if (decl?.kind === record.recordKind) record.base = { ...decl.base, ...record.base }
    if (!types.has(pageType)) {
      if (record.recordKind === 'article')
        unproven(state.sink, 'article_category_not_declared', { record: record.key })
      continue
    }
    record.category = categoryRecordOf(state, pageType).key
  }
}
