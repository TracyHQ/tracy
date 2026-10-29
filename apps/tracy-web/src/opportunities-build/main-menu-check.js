import { parse } from 'parse5'
import {
  invalidMenuLabel,
  isPrimaryMenuPage,
  mainMenuTargets,
  menuPath
} from 'website-opportunities/domain/main-menu.mjs'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const text = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join(' '))
const above = (node, matches) => node && (matches(node) || above(node.parentNode, matches))
const walk = (node, visit) => {
  visit(node)
  for (const child of node.childNodes ?? []) walk(child, visit)
}

/** The rendered main navigation copies (desktop, mobile); footer, sidebar and breadcrumbs never qualify. */
export function renderedMainMenus(html, origin = null) {
  const root = parse(String(html ?? ''))
  const menus = []
  walk(root, (node) => {
    if (node.tagName !== 'nav' && attr(node, 'role') !== 'navigation') return
    if (
      above(
        node,
        (n) =>
          ['footer', 'aside'].includes(n.tagName) ||
          /footer|footnav|breadcrumb/i.test(`${attr(n, 'id')} ${attr(n, 'class')} ${attr(n, 'aria-label')}`)
      )
    )
      return
    const main = above(
      node,
      (n) =>
        n.tagName === 'header' ||
        /(?:header|main.?nav|mega.?menu|off.?canvas)/i.test(`${attr(n, 'id')} ${attr(n, 'class')}`)
    )
    if (!main && !/primary|main/i.test(attr(node, 'aria-label'))) return
    const links = []
    walk(node, (a) => {
      if (a.tagName !== 'a') return
      const href = attr(a, 'href')
      if (!href || href.startsWith('#') || /^(?:mailto|tel|javascript):/i.test(href)) return
      // Absolute links count only when the build's site is their destination.
      if (/^(?:https?:)?\/\//i.test(href)) {
        try {
          const base = origin && new URL(String(origin).includes('://') ? origin : `https://${origin}`)
          if (!base || new URL(href, base).host !== base.host) return
        } catch {
          return
        }
      }
      links.push({
        label: text(a).replace(/\s+/g, ' ').trim(),
        href: menuPath(href),
        parent: a.parentNode?.parentNode
      })
    })
    menus.push(links)
  })
  return menus
}

/** Every primary kept page is reachable, and every kept page it names has a useful name, in each rendered main menu. */
export function checkMainMenu({ pages, sitePlan, origin = null }) {
  const findings = []
  for (const page of pages.filter((p) => !p.status || p.status === 200)) {
    const menus = renderedMainMenus(page.html, origin)
    const targets = mainMenuTargets(
      sitePlan,
      menus.flat().map((i) => ({ ...i, path: i.href }))
    )
    if (!menus.length) findings.push({ path: page.path, reason: 'missing-main-menu' })
    menus.forEach((links, menu) => {
      for (const target of targets) {
        const matches = target.path ? links.filter((l) => l.href === menuPath(target.path)) : []
        const reachable = target.path && menus.flat().some((l) => l.href === menuPath(target.path))
        // The header may be shorter: only a primary page must be reachable from it (the footer lists every page).
        if (!reachable && menu === 0 && isPrimaryMenuPage(target))
          findings.push({
            path: page.path,
            menu,
            href: target.path,
            page: target.id,
            reason: 'unreachable-page'
          })
        for (const link of matches) {
          const reason = invalidMenuLabel(link.label, target.role)
          if (reason) findings.push({ path: page.path, menu, href: link.href, label: link.label, reason })
        }
      }
      const levels = new Map()
      for (const link of links) {
        const seen = levels.get(link.parent) ?? new Set()
        const label = link.label.toLowerCase()
        if (label && seen.has(label))
          findings.push({
            path: page.path,
            menu,
            href: link.href,
            label: link.label,
            reason: 'duplicate-label'
          })
        seen.add(label)
        levels.set(link.parent, seen)
      }
    })
  }
  if (!pages.some((p) => !p.status || p.status === 200)) findings.push({ reason: 'unread-main-menu' })
  return { pass: findings.length === 0, findings }
}
