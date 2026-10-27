// Compact on-disk form of the coverage plan. The expanded form has
// one object per door per tag with a long reason text each (1.4 MB); the files are kept small by
// storing every distinct reason once (door id replaced by `{id}`) and a door's 21 tags as one string of
// tokens in `requiredTags` order:
//   c = has cases   v = covered by a sibling door's case   n<i> = N-A, reason i   o<i> = open, reason i
// The case ids of a `c`/`v` tag are not stored: they are the manifests whose first edge tag is that tag
// and whose itemIds name the door, so the plan can never disagree with the manifests it points at.
import { ContractError } from './io.mjs'

const toTemplate = (text, id) => text.split(id).join('{id}')
const fromTemplate = (text, id) => text.split('{id}').join(id)

export class ReasonTable {
  constructor() {
    this.list = []
    this.index = new Map()
  }

  add(text, id) {
    const t = toTemplate(text, id)
    if (!this.index.has(t)) {
      this.index.set(t, this.list.length)
      this.list.push(t)
    }
    return this.index.get(t)
  }
}

/** @param {{id: string, membership: string, tags: Record<string, object>}[]} items expanded plan items */
export function compactPlan(items, requiredTags) {
  const reasons = new ReasonTable()
  const out = items.map((item) => {
    const tokens = requiredTags.map((tag) => {
      const t = item.tags[tag]
      if (!t) throw new ContractError(`${item.id}: no status for tag ${tag}`)
      if (t.status === 'cases') return 'c'
      if (t.status === 'covered-by') return 'v'
      if (t.status === 'na') return `n${reasons.add(t.reason, item.id)}`
      if (t.status === 'open') return `o${reasons.add(t.reason, item.id)}`
      throw new ContractError(`${item.id}/${tag}: unknown status ${t.status}`)
    })
    return { id: item.id, membership: item.membership, tags: tokens.join(' ') }
  })
  return { reasons: reasons.list, items: out }
}

/** Back to the expanded form buildCoverage reads; case ids come from `manifests`. */
export function expandPlan(plan, manifests) {
  const tags = plan.requiredTags
  if (!Array.isArray(tags) || !Array.isArray(plan.reasons) || !Array.isArray(plan.items))
    throw new ContractError('coverage.plan.json: requiredTags, reasons and items must be arrays')
  const byKey = new Map()
  for (const m of manifests) {
    // A door scenario is a named outcome, not the door's case for a tag: it never fills the plan.
    if (m.scenario) continue
    for (const id of m.itemIds) {
      const key = `${id}\0${m.edgeTags[0]}`
      byKey.set(key, [...(byKey.get(key) ?? []), m.id])
    }
  }
  const items = plan.items.map((item) => {
    const tokens = String(item.tags).split(' ')
    if (tokens.length !== tags.length)
      throw new ContractError(`${item.id}: ${tokens.length} tag tokens for ${tags.length} required tags`)
    const out = {}
    tags.forEach((tag, i) => {
      const tok = tokens[i]
      if (tok === 'c' || tok === 'v') {
        out[tag] = {
          status: tok === 'c' ? 'cases' : 'covered-by',
          cases: byKey.get(`${item.id}\0${tag}`) ?? []
        }
        return
      }
      const m = /^([no])(\d+)$/.exec(tok)
      const text = m ? plan.reasons[Number(m[2])] : undefined
      if (text === undefined) throw new ContractError(`${item.id}/${tag}: bad token ${tok}`)
      out[tag] = { status: m[1] === 'n' ? 'na' : 'open', reason: fromTemplate(text, item.id) }
    })
    return { id: item.id, membership: item.membership, tags: out }
  })
  return { ...plan, items }
}

/** Ids of the cases a plan item has for one tag: the manifests of that tag naming the item. */
export const caseIdsFor = (manifests, itemId, tag) =>
  manifests.filter((m) => !m.scenario && m.edgeTags[0] === tag && m.itemIds.includes(itemId)).map((m) => m.id)
