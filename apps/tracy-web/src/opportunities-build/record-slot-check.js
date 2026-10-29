// The final check of record slots (#189 item 18, `record-roles.mjs`): every record the site plan assigned to a slot (a
// guest review's words, author and source, a person's name) is on the served site as the brief gives it. A record the
// pages do not show means another value took its place (the demo's, a writer's, the business's own name signing a
// customer's review): a blocker. Read from the served HTML, so it holds for Joomla, WordPress and EmDash pages alike.
// Contact lines, statistics and videos have their own checks (`contactCheck`, `statistic-check.js`, the video check).
import { parse } from 'parse5'
import { isRecordRole } from 'website-opportunities/domain/record-roles.mjs'

const SKIPPED = new Set(['script', 'style', 'template', 'noscript'])
const folded = (value) =>
  String(value ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Every text and attribute value of a page, folded into one string. */
function pageText(html) {
  const parts = []
  const walk = (node) => {
    if (SKIPPED.has(node.tagName)) return
    if (node.nodeName === '#text') parts.push(node.value)
    for (const a of node.attrs ?? []) if (['src', 'href', 'title', 'alt'].includes(a.name)) parts.push(a.value)
    for (const child of node.childNodes ?? []) walk(child)
    if (node.content) walk(node.content)
  }
  walk(parse(String(html ?? '')))
  return folded(parts.join(' '))
}

/**
 * The entities shown only on pages the plan drops: their records are not owed to the site. Read from a content map that
 * lists each page's assigned modules; a map without them owes every record.
 */
function droppedOnly(contentMap, sitePlan) {
  const dropped = new Set(
    (sitePlan?.pages ?? []).filter((p) => p?.decision === 'drop').map((p) => String(p.id ?? ''))
  )
  const kept = new Map()
  for (const page of contentMap?.pages ?? [])
    for (const module of page?.assignedModules ?? []) {
      const live = module.assignmentMode === 'all' || !dropped.has(String(page.route ?? ''))
      kept.set(module.entity, (kept.get(module.entity) ?? false) || live)
    }
  return new Set([...kept].filter(([, live]) => !live).map(([entity]) => entity))
}

/**
 * @param {{pages: Array<{path: string, status: number, html: string}>, sitePlan: any, contentMap?: any}} input
 * @returns {Array<{kind: 'record-not-shown', severity: 'blocker', page: string, place: string, role: string,
 *   found: string, why: string}>}
 */
export function checkRecordSlots({ pages, sitePlan, contentMap = null }) {
  const values = sitePlan?.honesty?.values ?? {}
  const served = (pages ?? []).filter((p) => p.status === 200)
  if (!served.length) return []
  const site = served.map((p) => pageText(p.html)).join(' ')
  const entityOf = new Map((contentMap?.slots ?? []).map((s) => [s.key, s.entity]))
  const off = droppedOnly(contentMap, sitePlan)
  const out = []
  for (const slot of sitePlan?.slots ?? []) {
    const record = values[slot?.key]?.value
    if (!isRecordRole(slot?.role) || typeof record !== 'string' || !record.trim()) continue
    if (off.has(entityOf.get(slot.key))) continue
    if (site.includes(folded(record))) continue
    out.push({
      kind: 'record-not-shown',
      severity: 'blocker',
      page: served[0].path,
      place: slot.key,
      role: slot.role,
      found: record,
      why: `The record of ${slot.role} is not on the site: another value took its place`
    })
  }
  return out
}
