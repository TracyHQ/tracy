// The two rounds of the page writer (ticket #594): every page written in parallel, all checked together (each page's
// own check, then the site check of `page-writer-site-check.mjs`), the failing fields of each page rewritten once, and
// all checked together again.
//
// In the rewrite round only a rewritten page can be the offender: the pages written before (`others`) and the pages
// not rewritten (they passed) come first, as earlier copy, and only the rewritten pages may fail. So a clean page is
// never failed by the rewrite of another page, which has no rewrite left. Pure but for the model calls.
import { callPage, pageFailing, pageOut } from './page-writer-page.mjs'
import { siteCopyFailing } from './page-writer-site-check.mjs'

/** How many calls a page may take: the first writing and one rewrite of the failing fields. */
export const PAGE_WRITE_ATTEMPTS = 2

/** A written page as the site check reads it: its fields with their declared limits, and its search texts. */
const writtenOf = (state) => ({
  id: state.page.id,
  fields: pageOut(state).map((f, i) => ({ ...f, limit: state.fields[i].field.limit })),
  seo: state.seo
})

/** The failing fields of each of `own`: its own check, then the site check after `before` (pages and states). */
function failingOf(before, own, context) {
  const site = siteCopyFailing([...before, ...own.map(writtenOf)], {
    known: context.known,
    own: new Set(own.map((s) => s.page.id))
  })
  return own.map((state) => {
    const failing = pageFailing(state, context)
    for (const f of site.filter((x) => x.page === state.page.id)) {
      const same = failing.find((x) => x.key === f.key)
      if (same) same.problems.push(...f.problems)
      else failing.push({ key: f.key, value: f.value, problems: f.problems })
    }
    return failing
  })
}

/**
 * Every page written in parallel, checked together, its failing fields rewritten once, checked together again. With
 * `rewrite: false` (a build that already wrote these pages once) there is no rewrite round: a page is written at most
 * twice in one build. A call failing in the rewrite round is `noRerun`: running the step again would write a third time.
 */
export async function writeAll(states, { plan, context, model, signal, others, rewrite: rewriting = true }) {
  let rewrite = new Map(states.map((s) => [s, undefined]))
  const rounds = rewriting ? PAGE_WRITE_ATTEMPTS : 1
  for (let n = 0; n < rounds; n++) {
    const calling = states.filter((s) => s.slots.length > 0 && rewrite.has(s) && !(n === 0 && s.reused))
    const settled = await Promise.allSettled(
      calling.map((state) => callPage(state, { plan, context, model, signal, rewrite: rewrite.get(state) }))
    )
    const rejected = settled.find((r) => r.status === 'rejected')
    if (rejected) {
      if (n > 0 && rejected.reason && typeof rejected.reason === 'object') rejected.reason.noRerun = true
      throw rejected.reason
    }
    const checked = n === 0 ? states : states.filter((s) => rewrite.has(s))
    const kept = states.filter((s) => !checked.includes(s)).map(writtenOf)
    const failing = failingOf([...others, ...kept], checked, context)
    rewrite = new Map()
    checked.forEach((state, i) => {
      if (calling.includes(state)) state.attempts.push({ asked: state.asked, failing: failing[i] })
      state.failing = failing[i]
      if (failing[i].length) rewrite.set(state, failing[i])
    })
    if (rewrite.size === 0) break
  }
}
