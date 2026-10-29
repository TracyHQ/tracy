import { parse } from 'parse5'
import { menuPath } from 'website-opportunities/domain/main-menu.mjs'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const text = (node) =>
  node.nodeName === '#text'
    ? node.value
    : (node.childNodes ?? []).map(text).join(' ').replace(/\s+/g, ' ').trim()
// The page's own `<html>` and `<body>` classes describe the page (`nav-breakpoint-lg`), never a menu: read as one, they hid
// every link of the page from the check (measured on a real build, #189 round 9).
const PAGE_ROOTS = new Set(['html', 'body'])
const walk = (node, visit, inMenu = false, hidden = () => false) => {
  if (hidden(node)) return
  const menu =
    inMenu ||
    ['nav', 'header', 'footer'].includes(node.tagName) ||
    (!PAGE_ROOTS.has(node.tagName) &&
      /(?:^|\s)(?:nav|navbar|menu|breadcrumb|pagination)(?:\s|-|$)/i.test(attr(node, 'class')))
  visit(node, menu)
  for (const child of node.childNodes ?? []) walk(child, visit, menu, hidden)
}

/** The title link class of a related-page list item, as the leftover block's current-page rule names it. */
const CURRENT_RULE = /:has\(([\w.-]+)\.active\):not\(:has\(\1:not\(\.active\)\)\)/g
const classesOf = (node) => attr(node, 'class').split(/\s+/).filter(Boolean)

/**
 * The elements the leftover block's current-page rule hides on this page (`outside-map.mjs` `currentItems`): the child
 * of an element holding another item's title link, that holds the current item's title link and no other.
 */
function currentItemsHidden(document, html) {
  const titles = [...String(html).matchAll(CURRENT_RULE)].map((m) => m[1].split('.').filter(Boolean))
  if (!titles.length) return () => false
  const [tag, ...classes] = titles[0][0] === 'a' ? titles[0] : ['', ...titles[0]]
  const isTitle = (n) => (!tag || n.tagName === tag) && classes.every((c) => classesOf(n).includes(c))
  /** @type {Map<any, {active: number, other: number}>} */
  const count = new Map()
  const tally = (n) => {
    const own = n.tagName && isTitle(n) ? (classesOf(n).includes('active') ? [1, 0] : [0, 1]) : [0, 0]
    const out = { active: own[0], other: own[1] }
    for (const c of n.childNodes ?? []) {
      const t = tally(c)
      out.active += t.active
      out.other += t.other
    }
    count.set(n, out)
    return out
  }
  tally(document)
  const parents = new Map()
  const link = (n) => {
    for (const c of n.childNodes ?? []) {
      parents.set(c, n)
      link(c)
    }
  }
  link(document)
  return (n) => {
    const own = count.get(n)
    const up = count.get(parents.get(n))
    return Boolean(own && up && own.active > 0 && own.other === 0 && up.other > 0)
  }
}

/**
 * A button never sends the visitor to the page they are already on (COO decision, spec TracyHQ/tracy#189 item 23): on every
 * served page, a link in the page body (not a menu, the header, the footer or a breadcrumb) whose destination is that same
 * page, with no in-page anchor, is a finding. Same site only; a link with an anchor, a file or another host is judged elsewhere.
 */
export function checkSelfLinks({ pages, origin = null }) {
  const findings = []
  const seen = new Set()
  for (const page of pages ?? []) {
    if ((page.status && page.status !== 200) || /tracy-leftover-check-missing/.test(page.path)) continue
    const own = new Set([page.path, page.servedPath].filter(Boolean).map(menuPath))
    const document = parse(String(page.html ?? ''))
    const hidden = currentItemsHidden(document, page.html ?? '')
    walk(
      document,
      (node, inMenu) => {
        if (inMenu || node.tagName !== 'a') return
        const href = attr(node, 'href').trim()
        if (!href || href.includes('#') || /^(?:mailto|tel|javascript|sms):/i.test(href)) return
        let path = href
        if (/^(?:https?:)?\/\//i.test(href)) {
          try {
            const base = origin && new URL(String(origin).includes('://') ? origin : `https://${origin}`)
            const url = new URL(href, base || undefined)
            if (!base || url.host !== base.host) return
            path = url.pathname
          } catch {
            return
          }
        }
        if (!path.startsWith('/') || !own.has(menuPath(path))) return
        const label = text(node)
        const key = `${page.path}\u0000${label}`
        if (seen.has(key)) return
        seen.add(key)
        findings.push({ path: page.path, href: path, label, reason: 'self-link' })
      },
      false,
      hidden
    )
  }
  return { pass: findings.length === 0, findings }
}
