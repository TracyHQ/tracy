import { parse } from 'parse5'
import { menuPath } from 'website-opportunities/domain/main-menu.mjs'

/**
 * The final checks of buttons, videos and page names on the served pages (spec TracyHQ/tracy#189 round 9, class C). Each
 * is a rule by markup, never by template, read on what a visitor gets:
 *
 *   empty-video     a play control whose video address names no video (an embed or watch link with its id empty) is
 *                   shown: the visitor clicks play and gets an empty frame (unless the leftover block hides such controls)
 *   channel-target  a link in the words of a contact channel the site plan gives ("Message us on Instagram") leads
 *                   somewhere else than that channel (the profile instead of the direct message)
 *   page-names      one page is named differently by the header, the footer or the breadcrumbs
 *
 * A link to `#` is the leftover check's (C19); a button to its own page is the self-link check's.
 */

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const text = (node) =>
  node.nodeName === '#text'
    ? node.value
    : (node.childNodes ?? []).map(text).join(' ').replace(/\s+/g, ' ').trim()
const walk = (node, visit, place = null, inMenu = false) => {
  const here = placeOf(node) ?? place
  // A menu list or a breadcrumb trail names pages; a call-to-action button in the header does not.
  const menu =
    inMenu ||
    node.tagName === 'nav' ||
    (!['html', 'body'].includes(node.tagName) &&
      /(?:^|\s)(?:nav|navbar|menu|breadcrumbs?)(?:\s|-|$)/i.test(attr(node, 'class')))
  visit(node, here, menu)
  for (const child of node.childNodes ?? []) walk(child, visit, here, menu)
}
/** Where a link is named: the header, the footer or the breadcrumbs (the page's own `<body>` class is never one). */
function placeOf(node) {
  if (node.tagName === 'header') return 'header'
  if (node.tagName === 'footer') return 'footer'
  if (node.tagName === 'html' || node.tagName === 'body') return null
  const cls = attr(node, 'class')
  if (/(?:^|\s)breadcrumbs?(?:\s|-|$)/i.test(cls)) return 'breadcrumbs'
  if (/(?:^|[\s-])foot(?:er|nav)(?:\s|-|$)/i.test(cls)) return 'footer'
  if (/(?:^|[\s-])(?:header|mainnav|megamenu)(?:\s|-|$)/i.test(cls)) return 'header'
  return null
}

/** A video address with its video left out. */
const EMPTY_VIDEO =
  /(?:youtube(?:-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/|youtube\.com\/watch\?v=)(?:[?&#].*)?$/i
const VIDEO_ATTRS = ['data-src', 'href', 'data-video', 'data-url', 'src']
/** The leftover block's rule that hides such controls (`outside-map.mjs` `emptyVideos`). */
const EMPTY_VIDEO_RULE = /data-tracy-leftovers[\s\S]*?play controls that name no video/

const pathOf = (href, origin) => {
  const h = String(href ?? '').trim()
  if (!h || h.startsWith('#') || /^(?:mailto|tel|javascript|sms):/i.test(h)) return null
  if (/^(?:https?:)?\/\//i.test(h)) {
    try {
      const base = origin && new URL(String(origin).includes('://') ? origin : `https://${origin}`)
      const url = new URL(h, base || undefined)
      if (!base || url.host !== base.host) return null
      return menuPath(url.pathname)
    } catch {
      return null
    }
  }
  return h.startsWith('/') ? menuPath(h.split(/[?#]/)[0]) : null
}

/**
 * @param {{ pages: Array<{ path: string, status?: number, html?: string }>, sitePlan?: any, origin?: string | null }} input
 * @returns {Array<{ kind: string, severity: string, page: string, found: string, why: string }>}
 */
export function checkButtonsVideos({ pages, sitePlan = null, origin = null }) {
  const findings = []
  const channels = (sitePlan?.channels ?? []).filter(
    (c) => typeof c?.label === 'string' && c.label.trim() && typeof c?.href === 'string' && c.href
  )
  const byLabel = new Map(channels.map((c) => [c.label.trim().toLowerCase(), c]))
  /** @type {Map<string, Map<string, {place: string, page: string}>>} path → label → where first seen */
  const names = new Map()
  for (const page of pages ?? []) {
    if ((page.status && page.status !== 200) || /tracy-leftover-check-missing/.test(page.path)) continue
    const html = String(page.html ?? '')
    const videosHidden = EMPTY_VIDEO_RULE.test(html)
    const seen = new Set()
    walk(parse(html), (node, place, inMenu) => {
      if (!node.tagName) return
      if (!videosHidden)
        for (const name of VIDEO_ATTRS) {
          const value = attr(node, name)
          if (value && EMPTY_VIDEO.test(value.trim()) && !seen.has(`v${value}`)) {
            seen.add(`v${value}`)
            findings.push({
              kind: 'empty-video',
              severity: 'major',
              page: page.path,
              found: value,
              why: `A play control on ${page.path} opens a video address that names no video (${value})`
            })
          }
        }
      if (node.tagName !== 'a') return
      const label = text(node)
      const href = attr(node, 'href').trim()
      const channel = byLabel.get(label.toLowerCase())
      if (channel && href !== channel.href && !seen.has(`c${label}`)) {
        seen.add(`c${label}`)
        findings.push({
          kind: 'channel-target',
          severity: 'major',
          page: page.path,
          found: `${label} -> ${href}`,
          why: `"${label}" on ${page.path} leads to ${href || 'nowhere'}, not to the planned ${channel.href}`
        })
      }
      const path = place && inMenu && label ? pathOf(href, origin) : null
      if (!path) return
      const labels = names.get(path) ?? new Map()
      const key = label.toLowerCase()
      if (!labels.has(key)) labels.set(key, { label, place, page: page.path })
      names.set(path, labels)
    })
  }
  for (const [path, labels] of names) {
    if (labels.size < 2) continue
    const all = [...labels.values()]
    findings.push({
      kind: 'page-names',
      severity: 'minor',
      page: all[0].page,
      found: all.map((l) => `${l.place}: ${l.label}`).join(' | '),
      why: `The page ${path} has ${labels.size} names in the menus: ${all.map((l) => `"${l.label}" (${l.place})`).join(', ')}`
    })
  }
  return findings
}
