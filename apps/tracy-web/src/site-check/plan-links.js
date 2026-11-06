// The site check's `plan-links` measure (ADR 0044, decision 21): every link the plan keeps on a kept block, and every page's end
// action, is printed as a link a visitor can follow. The write report keeps them (`planLinks`, `endActions`, write-step
// plan-link-table.js); a page target is read at its address in `keptPages`, after the route stage renamed it. A link must print the
// plan's words (the written value of its label slot) and lead to its target; an end action must lead there from somewhere on its
// page. Missing blocks on step 9 (write), or on step 0 (template) when the template prints that control with no address, which the
// kit counts in `deadControls`. A page the host answered nothing for leaves its links unmeasured.
import { TEMPLATE_STEP, WRITE_STEP } from '../lib/site-build-steps.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'
import { pathOfMeasure } from './page-faults.js'

const each = (value) => (Array.isArray(value) ? value : [])
const words = (text) =>
  String(text ?? '')
    .replace(/\(\([^()]*\)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Whether a printed address leads where the target says. */
export function leadsTo(href, target, keptPaths) {
  let url
  try {
    url = new URL(String(href), 'http://site.invalid')
  } catch {
    return false
  }
  if (target.kind === 'phone')
    return url.protocol === 'tel:' && url.pathname.replace(/\D/g, '').endsWith(target.digits.slice(-9))
  if (target.kind === 'address') {
    const want = String(target.url)
    if (/^(?:tel|mailto):/i.test(want)) return String(href).toLowerCase() === want.toLowerCase()
    if (want.startsWith('/')) return pathOfMeasure(url.pathname) === pathOfMeasure(want)
    return String(href).replace(/\/+$/, '') === want.replace(/\/+$/, '')
  }
  const path = keptPaths.get(target.page)
  return (
    typeof path === 'string' &&
    /^https?:$/.test(url.protocol) &&
    pathOfMeasure(url.pathname) === pathOfMeasure(path)
  )
}

/** The links each kept page prints at any width, by page path. */
function linksByPage(measures) {
  const out = new Map()
  for (const m of each(measures)) {
    if (!Array.isArray(m.shownLinks)) continue
    const key = pathOfMeasure(m.path)
    out.set(key, [...(out.get(key) ?? []), ...m.shownLinks])
  }
  return out
}

/**
 * @param {object} report the write report
 * @param {object[]} measures the host's page measures
 * @returns {{ checked: number, failures: object[], unread: string[] }}
 */
export function judgePlanLinks(report, measures) {
  const keptPaths = new Map(each(report?.keptPages).map((p) => [p.id, p.path]))
  const printed = linksByPage(measures)
  const lines = new Map(each(report?.slots).map((s) => [s.slot, s]))
  const failures = []
  const unread = []
  let checked = 0
  const target = (t) => (t.kind === 'page' ? (keptPaths.get(t.page) ?? t.page) : (t.url ?? `tel:${t.digits}`))
  for (const link of each(report?.planLinks)) {
    // A link the write step reports gone with its row or its words is not a kept link any more.
    if (lines.get(link.link)?.status === 'hidden') continue
    if (link.target.kind === 'page' && !keptPaths.has(link.target.page)) continue
    const label = lines.get(link.labelSlot)
    const want =
      label?.status === 'written' && typeof label.ordered === 'string' ? words(label.ordered) : null
    const pages = each(link.pages).filter((p) => keptPaths.has(p))
    const read = pages.filter((p) => printed.has(pathOfMeasure(keptPaths.get(p))))
    if (!read.length) {
      unread.push(link.link)
      continue
    }
    checked++
    const missing = read.filter(
      (p) =>
        !printed
          .get(pathOfMeasure(keptPaths.get(p)))
          .some((a) => leadsTo(a.href, link.target, keptPaths) && (want === null || words(a.text) === want))
    )
    if (!missing.length) continue
    const dead = link.deadControl === true
    failures.push({
      page: keptPaths.get(missing[0]),
      slot: link.link,
      measured: want ?? null,
      causingStep: dead ? TEMPLATE_STEP : WRITE_STEP,
      reason: `The plan keeps ${link.link}${want ? ` ("${want}")` : ''} leading to ${target(link.target)}, and ${
        missing.length > 1 ? `${missing.length} pages print` : 'the page prints'
      } no such link${dead ? ': the template prints this control with no address (kit deadControls)' : ''}`
    })
  }
  for (const end of each(report?.endActions)) {
    const path = keptPaths.get(end.page)
    if (typeof path !== 'string') continue
    if (end.target.kind === 'page' && !keptPaths.has(end.target.page)) continue
    const links = printed.get(pathOfMeasure(path))
    if (!links) {
      unread.push(`${end.page}:end`)
      continue
    }
    checked++
    if (!links.some((a) => leadsTo(a.href, end.target, keptPaths)))
      failures.push({
        page: path,
        slot: `${end.page}:endAction`,
        reason: `The page ends on ${end.leadsTo} (${target(end.target)}), and nothing on it leads there`
      })
  }
  return { checked, failures, unread }
}

export const planLinksGroup = {
  name: 'plan-links',
  causingStep: WRITE_STEP,
  async run(context) {
    const { report } = context
    if (!Array.isArray(report?.planLinks) && !Array.isArray(report?.endActions))
      throw new GroupUnmeasured(
        'The write report keeps no plan links (made before they were kept), so this was not measured.'
      )
    if (!each(report.planLinks).length && !each(report.endActions).length) return { checked: 0, failures: [] }
    const read = await pagesRead(context)
    if (!read.measures.some((m) => Array.isArray(m.shownLinks)))
      throw new GroupUnmeasured('The host answered no shown links (`shownLinks`), so this was not measured.')
    const { checked, failures, unread } = judgePlanLinks(report, read.measures)
    if (!checked && unread.length)
      throw new GroupUnmeasured(
        `The host answered nothing for the pages of ${unread.length} plan links, so nothing was measured.`
      )
    for (const id of unread.slice(0, 10))
      failures.push({ level: 'warn', slot: id, reason: `Not measured: ${id} (no page read)` })
    return { checked, failures }
  }
}
