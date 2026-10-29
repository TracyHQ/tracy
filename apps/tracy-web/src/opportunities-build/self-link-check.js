import { parse } from 'parse5'
import { menuPath } from 'website-opportunities/domain/main-menu.mjs'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const text = (node) =>
  node.nodeName === '#text'
    ? node.value
    : (node.childNodes ?? []).map(text).join(' ').replace(/\s+/g, ' ').trim()
const walk = (node, visit, inMenu = false) => {
  const menu =
    inMenu ||
    ['nav', 'header', 'footer'].includes(node.tagName) ||
    /(?:^|\s)(?:nav|navbar|menu|breadcrumb|pagination)(?:\s|-|$)/i.test(attr(node, 'class'))
  visit(node, menu)
  for (const child of node.childNodes ?? []) walk(child, visit, menu)
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
    walk(parse(String(page.html ?? '')), (node, inMenu) => {
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
    })
  }
  return { pass: findings.length === 0, findings }
}
