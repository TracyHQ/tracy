// Index of the brief and the plan for the site plan checker: facts, withheld values, kept groups and pages,
// every block decision with its context, and the link target test. Ported from the approved checker script,
// sections "index the brief" and "index the plan".
import { arr, obj, str } from './rule-set.js'

function isObserved(f) {
  if (!f) return false
  if (f.source === 'observed') return true
  const ev = arr(f.evidence)
    .map((e) => e.source)
    .filter(Boolean)
  return ev.length > 0 && ev.every((s) => s === 'observed')
}

export function indexBrief(brief) {
  const facts = new Map(arr(brief.facts).map((f) => [f.id, f]))
  const missingFields = new Set(arr(brief.missing).map((m) => m.field))
  const withheld = []
  for (const m of arr(brief.missing)) {
    for (const w of arr(m.withheld)) {
      for (const v of arr(w.values))
        if (typeof v === 'string' && v.length >= 4) withheld.push({ field: m.field, value: v })
      for (const v of arr(w.hours))
        if (typeof v === 'string' && v.length >= 4) withheld.push({ field: m.field, value: v })
    }
  }
  return { facts, missingFields, withheld, isObserved }
}

// Everything a decision says about slots, in one place.
export function decisionParts(d) {
  const copy = arr(d.copy).map((c) => ({ ...obj(c), inItem: null }))
  const pics = arr(d.pictures).map((p) => ({ ...obj(p), inItem: null }))
  const hidden = arr(d.hiddenSlots).map(obj)
  const links = arr(d.links).map(obj)
  const lists = arr(d.lists).map(obj)
  for (const l of lists) {
    arr(l.items).forEach((it, i) => {
      const item = obj(it)
      arr(item.copy).forEach((c) => copy.push({ ...obj(c), inItem: { list: l.list, row: i } }))
      arr(item.pictures).forEach((p) => pics.push({ ...obj(p), inItem: { list: l.list, row: i } }))
    })
  }
  return { copy, pics, hidden, links, lists }
}

export const asDecision = (d) => (typeof d === 'string' ? { block: d } : obj(d))
export const W = (x, extra) => `${x.label} / block ${x.d.block}${extra ? ' / ' + extra : ''}`

const CHANNEL_KINDS = new Set(['phone', 'whatsapp', 'email', 'social', 'map'])
// Targets a link may lead to: kept page, contact channel, form, url, "create".
const CHANNELS = new Set(['phone', 'whatsapp', 'email', 'social', 'map', 'contact', 'primary-action'])

export function indexPlan(plan, k, b) {
  const { kitPages, formBlocks, linkIx } = k
  const { facts } = b
  const planGroups = arr(plan.pageGroups)
  const planPages = arr(plan.pages)
  const keptGroupIds = new Set(planGroups.filter((g) => g.decision === 'keep').map((g) => g.id))
  const droppedGroupIds = new Set(planGroups.filter((g) => g.decision === 'drop').map((g) => g.id))
  // A page of a kept group can be dropped on its own with pages[].decision = "drop" (spec, What you may decide).
  // A dropped page needs no slug, footer entry, story or block decisions.
  const droppedPageIds = new Set(planPages.filter((p) => p.decision === 'drop').map((p) => p.id))
  const livePages = planPages.filter((p) => !droppedPageIds.has(p.id))
  const keptPageIds = new Set(
    livePages
      .map((p) => p.id)
      .filter((id) => {
        const kp = kitPages.get(id)
        return !kp || !droppedGroupIds.has(kp.group)
      })
  )
  // Every block decision with its context.
  const decisions = []
  arr(plan.sharedBlocks).forEach((d, i) =>
    decisions.push({ d: asDecision(d), page: null, label: `sharedBlocks[${i}]` })
  )
  livePages.forEach((p) =>
    arr(p.blocks).forEach((d) => decisions.push({ d: asDecision(d), page: p.id, label: `page ${p.id}` }))
  )
  const keptDecisions = decisions.filter((x) => x.d.decision === 'keep')

  // The spec lets the planner create a Privacy Policy page and says it goes in the footer, but gives a created
  // page no id. The plan writes "legal:<kind>"; accept it when plan.site.legalPages holds that kind.
  const legalKinds = new Set(arr(obj(plan.site).legalPages).map((l) => obj(l).kind))
  const isLegalRef = (t) => str(t).startsWith('legal:') && legalKinds.has(str(t).slice(6))
  function targetProblem(v, linkId) {
    const t = str(v).trim()
    if (!t) return 'empty target'
    if (isLegalRef(t)) return null
    const m = /^([a-z]+):(.+)$/.exec(t)
    if (m && CHANNEL_KINDS.has(m[1]) && facts.has(m[2])) return null // <channel>:<factId>
    if (t === 'lightbox' && linkId) {
      const kl = linkIx.get(linkId)
      if (kl && kl.action === 'page-control') return null
    } // template gallery behaviour
    if (kitPages.has(t)) return keptPageIds.has(t) ? null : `page ${t} is dropped or not in plan.pages`
    if (t.startsWith('page-')) return `page ${t} does not exist in the kit`
    if (CHANNELS.has(t) || formBlocks.has(t) || t === 'create' || facts.has(t)) return null
    if (arr(plan.site && plan.site.contactChannels).some((c) => c.kind === t)) return null
    if (/^(https?:|tel:|mailto:|\/|#)/.test(t)) return null
    return `target "${t}" is neither a kept page, a contact channel, a form nor a URL`
  }

  return {
    planGroups,
    planPages,
    keptGroupIds,
    droppedGroupIds,
    droppedPageIds,
    livePages,
    keptPageIds,
    decisions,
    keptDecisions,
    isLegalRef,
    targetProblem
  }
}
