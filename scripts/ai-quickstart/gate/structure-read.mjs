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
 * which page a page is (`identify(html)`, e.g. its menu item and title): one that reaches a planned page that answered
 * is that page at another address (a friendly menu address of `index.php?Itemid=N`), no broken link; one that reaches
 * a page the plan has not got that answers is recorded apart (`unplanned`); one that does not answer is a link to a
 * missing page. Without `identify` every such link stays a broken `demo_page`.
 * @returns {Promise<{broken: object[], unplanned: object[], probes: number, capped: boolean}>}
 */
export async function linksOf(site, read, { base, demoRoutes, identify = null }) {
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
  const planned = new Map()
  if (identify)
    for (const p of read)
      if (p.status > 0 && p.status < 400) {
        const id = identify(p.html)
        if (id && !planned.has(id)) planned.set(id, p)
      }
  const broken = []
  const unplanned = []
  for (const f of found) {
    const url = identify && f.kind === 'demo_page' ? urlOf(f.href, f.page, base) : null
    if (!url || asked.size >= PROBE_MAX) {
      broken.push(withTarget(f, read, base))
      continue
    }
    const answer = await fetchOnce(url)
    const status = answer?.status ?? 0
    if (status === 0 || status >= 400) {
      broken.push({ ...withTarget(f, read, base), kind: 'missing_page', status })
      continue
    }
    const target = planned.get(identify(answer.html ?? ''))
    if (!target) unplanned.push({ ...f, kind: 'unplanned_page', status })
  }
  return { broken, unplanned, probes: asked.size, capped: asked.size >= PROBE_MAX }
}
