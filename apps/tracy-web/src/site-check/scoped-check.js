// A site check of some pages, joined to a check of the whole site (#448, step 9b): after a repair turn, the site check
// reads only the pages the turn changed (runSiteCheck `pages`), and the site as it now is keeps the earlier check's
// failures on every other page. A failure that names no page belongs to the newer check, which measured it again. Each
// group's status and the counts follow the failures kept; a group the newer check could not measure stays unmeasured.
// Pure.
import { pagePath } from '../lib/hidden-page-links.js'

const NOT_APPLICABLE = 'not-applicable'

const statusOf = (failures, was) => {
  if (failures.some((f) => (f.level ?? 'block') === 'block')) return 'red'
  return was === 'red' ? 'green' : was
}

/**
 * @param {object} base `site-check/1` of the whole site
 * @param {object} scoped `site-check/1` read only on `pages`
 * @param {string[]} pages the pages `scoped` read
 * @returns {object} `site-check/1` of the whole site, with `scopedPages` the pages re-read so far
 */
export function mergeScopedCheck(base, scoped, pages) {
  const on = new Set(pages.map((p) => pagePath(p)))
  const fresh = (f) => !f.page || on.has(pagePath(f.page))
  const names = [...new Set([...(base?.groups ?? []), ...(scoped?.groups ?? [])].map((g) => g.name))]
  const groups = names.map((name) => {
    const was = (base?.groups ?? []).find((g) => g.name === name)
    const now = (scoped?.groups ?? []).find((g) => g.name === name)
    const failures = [
      ...(was?.failures ?? []).filter((f) => !fresh(f)),
      ...(now?.failures ?? []).filter(fresh)
    ]
    const from = now ?? was
    return { ...from, status: statusOf(failures, from.status), failures }
  })
  const every = groups.flatMap((g) => g.failures)
  const status = groups.some((g) => g.status === 'red')
    ? 'red'
    : groups.some((g) => g.status === 'unmeasured')
      ? 'unmeasured'
      : 'green'
  return {
    ...base,
    status,
    counts: {
      block: every.filter((f) => (f.level ?? 'block') === 'block').length,
      warn: every.filter((f) => f.level === 'warn').length,
      unmeasured: groups.filter((g) => g.status === 'unmeasured').length,
      notApplicable: groups.filter((g) => g.status === NOT_APPLICABLE).length
    },
    groups,
    scopedPages: [...new Set([...(base?.scopedPages ?? []), ...on])]
  }
}
