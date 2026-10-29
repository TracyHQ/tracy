import { parse } from 'parse5'
import { mainMenuTargets, menuPath } from 'website-opportunities/domain/main-menu.mjs'
import {
  footerDemoWords,
  footerNavigationGroups,
  isOfferingIndex,
  offeringPagesLinkedFrom
} from 'website-opportunities/domain/footer-navigation.mjs'
import { renderedMainMenus } from './main-menu-check.js'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const text = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join(' '))
const above = (node, matches) => node && (matches(node) || above(node.parentNode, matches))
const flat = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const walk = (node, visit) => {
  visit(node)
  for (const child of node.childNodes ?? []) walk(child, visit)
}
const inFooter = (node) =>
  above(node, (n) => n.tagName === 'footer' || /footer|footnav/i.test(`${attr(n, 'id')} ${attr(n, 'class')}`))

/**
 * The footer's link columns as rendered: every link inside a list or a nav of the footer region (a logo or a button is
 * not a column link), and the footer's headings. `dead` holds the column links that lead nowhere (`#`, empty).
 */
export function renderedFooterLinks(html, origin = null) {
  const root = parse(String(html ?? ''))
  const links = []
  const dead = []
  const headings = []
  walk(root, (node) => {
    if (/^h[1-6]$/.test(node.tagName ?? '') && inFooter(node)) headings.push(flat(text(node)))
    if (node.tagName !== 'a' || !inFooter(node)) return
    if (!above(node, (n) => ['ul', 'ol', 'nav'].includes(n.tagName) || attr(n, 'role') === 'navigation'))
      return
    const href = attr(node, 'href').trim()
    const label = flat(text(node))
    if (!href || href === '#') {
      dead.push({ label, href })
      return
    }
    if (href.startsWith('#') || /^(?:mailto|tel|javascript|sms):/i.test(href)) return
    if (/^(?:https?:)?\/\//i.test(href)) {
      try {
        const base = origin && new URL(String(origin).includes('://') ? origin : `https://${origin}`)
        if (!base || new URL(href, base).host !== base.host) return
      } catch {
        return
      }
    }
    links.push({ label, href: menuPath(href) })
  })
  return { links, dead, headings }
}

/**
 * The footer is complete (COO decision, spec TracyHQ/tracy#189 item 12): on every served page, every kept page and each
 * offering page an offerings index links to is linked from the footer; the footer has at least as many links as the
 * header; no demo heading, demo link, dead link or empty label remains. Judged only where the content map declares
 * footer navigation groups (a map without them has no footer column the build writes).
 */
export function checkFooterNavigation({ pages, sitePlan, contentMap, origin = null }) {
  if (!sitePlan || !footerNavigationGroups(contentMap).length) return null
  const served = pages.filter(
    (p) => (!p.status || p.status === 200) && !/tracy-leftover-check-missing/.test(p.path)
  )
  const demo = footerDemoWords(contentMap)
  const targets = mainMenuTargets(sitePlan)
  const offerings = targets
    .filter((t) => t.path && isOfferingIndex(t))
    .flatMap((t) => {
      const page = served.find(
        (p) => menuPath(p.servedPath ?? p.path) === menuPath(t.path) || menuPath(p.path) === menuPath(t.path)
      )
      const hrefs = page
        ? [...String(page.html).matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)].map((m) => m[1])
        : []
      return offeringPagesLinkedFrom(t.path, hrefs)
    })
  const wanted = [
    ...new Set([...targets.map((t) => t.path && menuPath(t.path)).filter(Boolean), ...offerings])
  ]
  const findings = []
  const seen = new Set()
  const add = (finding) => {
    const key = `${finding.reason}\u0000${finding.href ?? ''}\u0000${finding.label ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push(finding)
  }
  for (const page of served) {
    const { links, dead, headings } = renderedFooterLinks(page.html, origin)
    const hrefs = new Set(links.map((l) => l.href))
    for (const path of wanted)
      if (!hrefs.has(path)) add({ path: page.path, href: path, reason: 'footer-missing-page' })
    const header = new Set((renderedMainMenus(page.html, origin)[0] ?? []).map((l) => l.href))
    if (hrefs.size < header.size)
      add({ path: page.path, reason: 'footer-shorter-than-header', footer: hrefs.size, header: header.size })
    for (const heading of headings)
      if (demo.headings.has(heading.toLowerCase()))
        add({ path: page.path, label: heading, reason: 'footer-demo-heading' })
    for (const link of links) {
      if (!link.label) add({ path: page.path, href: link.href, reason: 'footer-empty-label' })
      else if (demo.links.has(link.label.toLowerCase()) && !wanted.includes(link.href))
        add({ path: page.path, href: link.href, label: link.label, reason: 'footer-demo-link' })
    }
    for (const link of dead) add({ path: page.path, label: link.label, reason: 'footer-dead-link' })
  }
  if (!served.length) add({ reason: 'unread-footer' })
  return { pass: findings.length === 0, findings }
}
