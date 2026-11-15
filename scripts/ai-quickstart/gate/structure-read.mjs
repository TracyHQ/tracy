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

/**
 * The links of the pages that answered, each with the page type it lands on, and how many addresses were probed.
 * @returns {Promise<{broken: object[], probes: number, capped: boolean}>}
 */
export async function linksOf(site, read, { base, demoRoutes }) {
  const asked = new Set()
  const found = await linkCheck({
    pages: read.filter((p) => p.status > 0 && p.status < 400),
    base,
    expected: { paths: read.map((p) => p.path) },
    probe: async (url) => {
      asked.add(url)
      return { status: (await site.fetch(url)).status }
    },
    demoRoutes
  })
  return {
    broken: found.map((f) => withTarget(f, read, base)),
    probes: asked.size,
    capped: asked.size >= PROBE_MAX
  }
}
