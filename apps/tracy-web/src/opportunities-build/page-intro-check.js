// Inspect only the page's opening text. A footer/contact card must not turn a team introduction into a false finding.
import { parse } from 'parse5'
import { introRoleProblem } from 'website-opportunities/domain/page-intro-role.mjs'
import { menuPath } from 'website-opportunities/domain/main-menu.mjs'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value
const skipped = new Set(['nav', 'footer', 'script', 'style', 'template', 'noscript'])
const children = (node) =>
  (node.childNodes ?? []).filter(
    (n) => !skipped.has(n.tagName) && attr(n, 'hidden') === undefined && attr(n, 'aria-hidden') !== 'true'
  )
const walk = (node) => [node, ...children(node).flatMap(walk)]
const text = (node) =>
  (node.nodeName === '#text' ? node.value : children(node).map(text).join(' ')).replace(/\s+/g, ' ').trim()

/** Cross-CMS readback: masthead/hero description, else the first lead after the page heading. */
export function pageIntroduction(html) {
  const nodes = walk(parse(String(html ?? '')))
  const masthead = nodes.find((n) =>
    /(?:^|[\s_-])(?:ja-?masthead|masthead|hero|page-header|page-intro)(?:$|[\s_-])/i.test(
      attr(n, 'class') ?? ''
    )
  )
  const inMasthead = masthead ? walk(masthead) : []
  const intro = inMasthead.find(
    (n) =>
      n.tagName === 'p' ||
      /(?:^|[\s_-])(?:description|desc|lead|intro)(?:$|[\s_-])/i.test(attr(n, 'class') ?? '')
  )
  if (intro) return text(intro)
  const heading = nodes.findIndex((n) => n.tagName === 'h1')
  if (heading < 0) return null
  for (const node of nodes.slice(heading + 1)) {
    if (/^h[1-6]$/.test(node.tagName ?? '')) break
    if (node.tagName === 'p') return text(node)
  }
  return null
}

/** Missing or mismatched introductions make the build unclean, including any later overwrite of the writer's repair. */
export function checkPageIntros({ pages, sitePlan }) {
  const out = []
  for (const planned of sitePlan?.pages ?? []) {
    if (planned.decision !== 'keep' || ['home', 'other', 'sample'].includes(planned.role)) continue
    const page = pages.find(
      (p) =>
        menuPath(p.path) === menuPath(planned.path ?? `/${planned.id}`) ||
        menuPath(p.servedPath) === menuPath(planned.path ?? `/${planned.id}`)
    )
    if (!page || page.status >= 300) continue
    const language = /<html\b[^>]*\blang=["']([^"']+)/i.exec(page.html)?.[1] ?? 'en'
    if (!language.toLowerCase().startsWith('en')) continue
    const value = pageIntroduction(page.html)
    if (value === null) continue
    const offerings =
      (sitePlan.slots ?? []).find((s) => s.page === planned.id && s.offerings)?.offerings ?? []
    const problem = introRoleProblem(value, planned.role, offerings)
    if (problem)
      out.push({
        kind: 'page-intro-role',
        severity: 'major',
        page: page.path,
        role: planned.role,
        found: value,
        why: problem
      })
  }
  return out
}
