// Two page measures read from the pages as a visitor's browser gets them, with no browser (page-links-read.js):
//   reachable-pages  block  9 write  every page a link of a kept page leads to, planned or not, is opened: it answers, and a page the
//                                    plan does not keep prints none of the demo's words (a menu label written over a target that
//                                    could not move leads a visitor to the template's demo page); a card's name that leads to the
//                                    page of another card (the page's heading names another card of the same page) blocks too
//   icon-glyphs      block  9 write  an icon in a Font Awesome 6 family (fa-brands, fa-solid...) on a page that loads only older
//                                    icon sheets draws no glyph: an empty square
// A page reader is needed for both, and the demo baseline for the demo words: without them the group is unmeasured.
import { WRITE_STEP } from '../lib/site-build-steps.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { headingOf, iconClassesOf, linksOf, textKeysOf } from './page-links-read.js'

/** The most pages the walk opens beyond the kept ones: a site past it is reported as not fully walked. */
export const REACH_MAX = 60
const each = (value) => (Array.isArray(value) ? value : [])
const keyOf = (p) => {
  const key = String(p)
    .replace(/^\/index\.php(?=\/|$|\?)/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
  return key === '' ? '/' : key
}
const wordsOf = (text) =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
const holds = (heading, name) => {
  const words = wordsOf(name)
  const have = new Set(wordsOf(heading))
  return words.length > 0 && words.every((w) => have.has(w))
}

async function readAll(pageHtml, paths) {
  const pages = new Map()
  for (const p of paths) pages.set(p, await pageHtml(p).catch(() => null))
  return pages
}

/** Card names on one page that lead to a page whose heading names another card of that page. */
function foreignCards(page, links, headings) {
  const out = []
  const byTarget = new Map()
  for (const l of links)
    if (l.inHeading && l.words) byTarget.set(keyOf(l.path), [...(byTarget.get(keyOf(l.path)) ?? []), l])
  for (const [target, cards] of byTarget) {
    const heading = headings.get(target)
    const names = [...new Set(cards.map((c) => c.words))]
    if (!heading || names.length < 2) continue
    const owners = names.filter((n) => holds(heading, n))
    if (!owners.length) continue
    for (const n of names)
      if (!owners.includes(n))
        out.push({
          page,
          measured: n,
          reason: `The card "${n}" leads to ${target}, the page of "${owners.join(', ')}" ("${heading}"), not a page about "${n}"`
        })
  }
  return out
}

export const reachablePagesGroup = {
  name: 'reachable-pages',
  causingStep: WRITE_STEP,
  /** @param {{ report: object, pageHtml?: (path: string) => Promise<string | null>, baseline?: object | null }} context */
  async run({ report, pageHtml, baseline }) {
    if (typeof pageHtml !== 'function')
      throw new GroupUnmeasured('No page reader was given, so no page could be opened.')
    const kept = each(report?.keptPages)
      .map((p) => p?.path)
      .filter((p) => typeof p === 'string')
    if (!kept.length) throw new GroupUnmeasured('The write report names no kept page to start the walk from.')
    const demo = new Set(each(baseline?.texts))
    const pages = await readAll(pageHtml, kept)
    if (![...pages.values()].some((h) => typeof h === 'string'))
      throw new GroupUnmeasured(`No kept page answered: ${kept.join(', ')}.`)
    const keptKeys = new Set(kept.map(keyOf))
    const from = new Map()
    const queue = [...pages].filter(([, h]) => typeof h === 'string')
    const failures = []
    let walked = 0
    while (queue.length) {
      const [page, html] = queue.shift()
      for (const link of linksOf(html)) {
        const key = keyOf(link.path)
        if (from.has(key) || keptKeys.has(key)) continue
        from.set(key, { page, words: link.words })
        if (walked >= REACH_MAX) continue
        walked++
        const read = await pageHtml(link.path).catch(() => null)
        pages.set(link.path, read)
        if (typeof read === 'string') queue.push([link.path, read])
      }
    }
    const headings = new Map(
      [...pages].filter(([, h]) => typeof h === 'string').map(([p, h]) => [keyOf(p), headingOf(h)])
    )
    for (const [path, html] of pages) {
      const key = keyOf(path)
      const via = from.get(key)
      if (typeof html !== 'string') {
        failures.push({
          page: via?.page ?? path,
          measured: path,
          reason: `${via ? `The link "${via.words}" leads to ${path}, which` : `The kept page ${path}`} does not answer`
        })
        continue
      }
      const demoLeft = keptKeys.has(key) ? 0 : [...textKeysOf(html)].filter((k) => demo.has(k)).length
      if (demoLeft)
        failures.push({
          page: path,
          measured: `${demoLeft} demo text blocks`,
          reason: `${path} is not a page the plan keeps, ${via ? `"${via.words}" on ${via.page} leads to it, ` : ''}and it prints ${demoLeft} blocks of the demo's words`
        })
      failures.push(...foreignCards(path, linksOf(html), headings))
    }
    return {
      checked: pages.size,
      reached: [...from.keys()],
      ...(from.size > walked ? { notWalked: from.size - walked } : {}),
      ...(demo.size
        ? {}
        : { demoUnmeasured: 'no demo baseline, so the demo words of unplanned pages were not read' }),
      failures
    }
  }
}

const FA6_ONLY = /(?:^|\s)fa-(brands|solid|regular|light|thin|duotone|sharp(?:-[a-z]+)?)(?=\s|$)/i

/** The Font Awesome versions a page's icon sheets are, from their addresses; empty when none can be named. */
export function iconSetsOf(html) {
  const versions = new Set()
  for (const [, href] of String(html ?? '').matchAll(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    if (/fontawesome-free|font-?awesome-?6/i.test(href)) versions.add(6)
    else if (/font-?awesome-?5/i.test(href)) versions.add(5)
    else if (/font-?awesome(?:\/|\.)/i.test(href)) versions.add(4)
  }
  return versions
}

export const iconGlyphsGroup = {
  name: 'icon-glyphs',
  causingStep: WRITE_STEP,
  /** @param {{ report: object, pageHtml?: (path: string) => Promise<string | null> }} context */
  async run({ report, pageHtml }) {
    if (typeof pageHtml !== 'function')
      throw new GroupUnmeasured('No page reader was given, so no icon could be read.')
    const kept = each(report?.keptPages)
      .map((p) => p?.path)
      .filter((p) => typeof p === 'string')
    const pages = await readAll(pageHtml, kept)
    const read = [...pages].filter(([, h]) => typeof h === 'string')
    if (!read.length) throw new GroupUnmeasured('No kept page answered, so no icon was read.')
    const failures = []
    let checked = 0
    for (const [page, html] of read) {
      const sets = iconSetsOf(html)
      const icons = iconClassesOf(html)
      if (!sets.size) continue
      checked += icons.length
      if (sets.has(6)) continue
      for (const cls of new Set(icons.filter((c) => FA6_ONLY.test(c))))
        failures.push({
          page,
          measured: cls,
          reason: `The icon "${cls}" is in a Font Awesome 6 family and the page loads only Font Awesome ${[...sets].sort().join(' and ')}, so it draws an empty square`
        })
    }
    if (!checked)
      return {
        checked: 0,
        notApplicable: 'no kept page names its icon sheets, so no icon could be judged',
        failures
      }
    return { checked, failures }
  }
}
