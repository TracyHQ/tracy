// Reading the pages of a structure variant and the links on them (ticket #586): each page with the status it is
// planned to answer, and every link checked by `linkCheck` with an HTTP probe. The link check reads at most
// `PROBE_MAX` addresses again; the probes are counted here, so a variant whose links reach that limit says it did not
// read every link instead of passing on the ones it read. Pure but for the injected site.
import { foldPath, linkCheck, PROBE_MAX } from '../rendered-scan/links.mjs'

/** Read every page, keeping the status it is planned to answer (200, or the 404 of the missing page). */
export async function readPages(site, pages) {
  const read = []
  for (const p of pages) {
    const answer = await site.fetch(p.url)
    read.push({
      ...p,
      expected: p.expected ?? p.status ?? 200,
      status: answer.status,
      html: answer.html ?? ''
    })
  }
  return read
}

/** The pages that did not answer as planned: no answer (0), an error, or another status. */
export const errorsOf = (read, expected = (p) => p.expected) =>
  read
    .filter((p) => p.status !== expected(p))
    .map((p) => ({ pageType: p.pageType, path: p.path, status: p.status, expected: expected(p) }))

/** The page type a link lands on, when the plan has that page. */
function withTarget(finding, pages, base) {
  let path = finding.href
  try {
    const url = new URL(finding.href, base)
    path = url.pathname + url.search
  } catch {
    // A link that is no address keeps its own spelling.
  }
  const target = pages.find((p) => foldPath(p.path) === foldPath(path) || p.url === finding.href)
  return { ...finding, ...(target ? { target: target.pageType } : {}) }
}

/** The address a link of a page asks for, as the site is read. */
const urlOf = (href, page, base) => {
  try {
    return new URL(href, new URL(page ?? '', base)).toString()
  } catch {
    return null
  }
}

/**
 * The links of the pages that answered, each with the page type it lands on, and how many addresses were probed.
 * A link the check finds no planned path for (`demo_page`) is judged by the page it reaches, when the adapter can say
 * which page a page is (`identify(html)`: its menu item and title), except a link to one of the template's demo routes,
 * which stays broken (review 4 X2). One that reaches a planned page that answered is that page at another address (a
 * friendly menu address of `index.php?Itemid=N`), no broken link; one that reaches a page with the title of a planned
 * page under another menu item (an article read under another menu path) is that planned page too, recorded apart
 * (`elsewhere`, X1); one that reaches a page the `hidden` pages were (by identity or title, read before they were
 * hidden) is broken, `hidden_page_still_answers` (X3); one that reaches a page the plan has not got that answers is
 * recorded apart (`unplanned`); one that does not answer is a link to a missing page. Without `identify` every such
 * link stays a broken `demo_page`.
 * @param {{base: string, demoRoutes?: string[], identify?: Function | null, hidden?: Array<{pageType: string,
 *   identity: string | null}>}} options
 * @returns {Promise<{broken: object[], unplanned: object[], elsewhere: object[], probes: number, capped: boolean}>}
 */
export async function linksOf(site, read, { base, demoRoutes, identify = null, hidden = [] }) {
  const asked = new Map()
  const fetchOnce = async (url) => {
    if (!asked.has(url)) asked.set(url, await site.fetch(url))
    return asked.get(url)
  }
  const found = await linkCheck({
    pages: read.filter((p) => p.status > 0 && p.status < 400),
    base,
    expected: { paths: read.map((p) => p.path) },
    probe: async (url) => ({ status: (await fetchOnce(url)).status }),
    demoRoutes
  })
  const demo = new Set((demoRoutes ?? []).map(foldPath))
  const titleOf = (id) => (id ? id.slice(id.indexOf('|') + 1) : null)
  const planned = new Map()
  // A title one planned page has: a page with that title under another menu item is that page.
  const byTitle = new Map()
  if (identify)
    for (const p of read)
      if (p.status > 0 && p.status < 400) {
        const id = identify(p.html)
        if (id && !planned.has(id)) planned.set(id, p)
        const t = titleOf(id)
        if (t) byTitle.set(t, byTitle.has(t) && byTitle.get(t) !== p ? null : p)
      }
  const hiddenById = new Map()
  const hiddenByTitle = new Map()
  for (const h of hidden)
    if (h.identity) {
      hiddenById.set(h.identity, h)
      if (titleOf(h.identity)) hiddenByTitle.set(titleOf(h.identity), h)
    }
  const broken = []
  const unplanned = []
  const elsewhere = []
  for (const f of found) {
    const url = identify && f.kind === 'demo_page' ? urlOf(f.href, f.page, base) : null
    const demoRoute = url ? demo.has(foldPath(new URL(url).pathname)) : false
    if (!url || demoRoute || asked.size >= PROBE_MAX) {
      broken.push(withTarget(f, read, base))
      continue
    }
    const answer = await fetchOnce(url)
    const status = answer?.status ?? 0
    if (status === 0 || status >= 400) {
      broken.push({ ...withTarget(f, read, base), kind: 'missing_page', status })
      continue
    }
    const id = identify(answer.html ?? '')
    if (planned.has(id)) continue
    const gone = hiddenById.get(id) ?? hiddenByTitle.get(titleOf(id))
    if (gone) {
      broken.push({ ...f, kind: 'hidden_page_still_answers', status, target: gone.pageType })
      continue
    }
    const same = byTitle.get(titleOf(id))
    if (same) elsewhere.push({ ...f, kind: 'planned_elsewhere', status, target: same.pageType })
    else unplanned.push({ ...f, kind: 'unplanned_page', status })
  }
  return { broken, unplanned, elsewhere, probes: asked.size, capped: asked.size >= PROBE_MAX }
}
