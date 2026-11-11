// Article copy describes an original owner post, never a service turned into invented news (#545).
import { kitSlotsWithBlock } from '../template-kit/kit-slots.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {})
const str = (x) => (typeof x === 'string' ? x : '')

export function checkArticleProvenance({
  R,
  facts,
  blockIx,
  slotRole,
  slotRow,
  keptDecisions,
  decisionParts,
  W
}) {
  const r = R.r25
  const pagesByPost = new Map()
  for (const x of keptDecisions) {
    const parts = decisionParts(x.d)
    const lists = blockIx.get(x.d.block)?.lists
    const rowRoles = new Map()
    for (const [id, list] of lists ?? [])
      rowRoles.set(id, new Map(arr(list.rowSlots).map((s) => [s.field, s.role])))
    const units = new Map()
    for (const c of parts.copy) {
      const role = slotRole.get(c.slot) ?? (c.inItem ? rowRoles.get(c.inItem.list)?.get(c.slot) : null)
      if (!/^article\.(title|lead|date)$/.test(str(role))) continue
      const unit = c.inItem ? `${c.inItem.list}:${c.inItem.row}` : x.d.block
      const posts = arr(c.factIds).filter((id) => {
        const f = facts.get(id)
        return f?.field === 'posts' && f.onSite !== false && obj(f.value).kind === 'post'
      })
      if (c.basis !== 'brief' || posts.length !== 1) {
        r.fail(
          W(x, `slot ${c.slot}`),
          'article copy must cite exactly one original owner post fact (field posts); hide or drop surplus articles',
          'plan'
        )
        continue
      }
      if (units.has(unit) && units.get(unit) !== posts[0])
        r.fail(
          W(x, `slot ${c.slot}`),
          'the title, lead and date of one article must cite the same original post',
          'plan'
        )
      else units.set(unit, posts[0])
      if (role === 'article.title' && x.page && !c.inItem && !slotRow.has(c.slot)) {
        const before = pagesByPost.get(posts[0])
        if (before && before !== x.page)
          r.fail(
            W(x, `slot ${c.slot}`),
            `this original post already fills article page ${before}; drop this surplus article page`,
            'plan'
          )
        pagesByPost.set(posts[0], x.page)
      }
      r.ok()
    }
    // Repeating a post on its detail page is valid; repeating it in two rows of one list is not.
    const used = new Map()
    for (const [unit, post] of units) {
      const list = unit.includes(':') ? unit.slice(0, unit.lastIndexOf(':')) : null
      if (!list) continue
      const key = `${list}:${post}`
      if (used.has(key))
        r.fail(W(x, unit), 'two article rows reuse one original post; remove the surplus row', 'plan')
      used.set(key, unit)
    }
  }
}

// Recheck both the original plan and the copy that will actually be written. A failed planner/writer result may
// still reach export; a valid plan does not authorize a writer to replace an owner post with invented trade news.
export function articleExportProblems({ kit, plan, brief, view }) {
  const slots = kitSlotsWithBlock(kit)
  const articles = view.slots.filter((s) =>
    /^article\.(title|lead|date)$/.test(slots.get(s.slot)?.slot.role ?? '')
  )
  if (!articles.length) return []
  if (!Array.isArray(plan?.pages) || !Array.isArray(brief?.facts))
    return articles.map((s) => ({
      where: s.slot,
      code: 'ARTICLE_PROVENANCE',
      detail: 'article provenance is unknown without its original plan and brief facts'
    }))
  const slotRole = new Map([...slots].map(([id, value]) => [id, value.slot.role]))
  const slotRow = new Map()
  const blockIx = new Map(
    arr(kit?.blocks).map((b) => {
      for (const l of arr(b.lists))
        for (const [row, r] of arr(l.rows).entries())
          for (const s of arr(r.slots)) slotRow.set(s.id, { list: l.id, row })
      return [b.id, { lists: new Map(arr(b.lists).map((l) => [l.id, l])) }]
    })
  )
  const decisionParts = (d) => ({
    copy: [
      ...arr(d.copy).map((c) => ({ ...c, inItem: null })),
      ...arr(d.lists).flatMap((l) =>
        arr(l.items).flatMap((item, row) =>
          arr(item.copy).map((c) => ({ ...c, inItem: { list: l.list, row } }))
        )
      )
    ]
  })
  const keptDecisions = [
    ...arr(plan.sharedBlocks).map((d) => ({ d, page: null })),
    ...arr(plan.pages)
      .filter((p) => p.decision !== 'drop')
      .flatMap((p) => arr(p.blocks).map((d) => ({ d, page: p.id })))
  ].filter((x) => x.d?.decision === 'keep')
  const unitOf = (c, d) => (c.inItem ? `${c.inItem.list}:${c.inItem.row}` : d.block)
  const copies = new Map(view.slots.map((s) => [s.slot, s]))
  const articleSlots = new Set(articles.map((s) => s.slot))
  const problems = []
  const seen = new Set()
  const fail = (where, detail) => {
    for (const slot of where) {
      const key = `${slot}:${detail}`
      if (seen.has(key)) continue
      seen.add(key)
      problems.push({ where: slot, code: 'ARTICLE_PROVENANCE', detail })
    }
  }
  const context = {
    facts: new Map(brief.facts.map((f) => [f.id, f])),
    blockIx,
    slotRole,
    slotRow,
    keptDecisions,
    decisionParts,
    W(x, extra) {
      const copy = decisionParts(x.d).copy
      const unit = extra.startsWith('slot ')
        ? unitOf(copy.find((c) => c.slot === extra.slice(5)) ?? {}, x.d)
        : extra
      return copy.filter((c) => unitOf(c, x.d) === unit && articleSlots.has(c.slot)).map((c) => c.slot)
    },
    R: { r25: { fail, ok() {} } }
  }
  checkArticleProvenance(context)
  checkArticleProvenance({
    ...context,
    decisionParts(d) {
      return {
        copy: decisionParts(d).copy.map((c) =>
          copies.has(c.slot) ? { ...c, factIds: copies.get(c.slot).factIds } : c
        )
      }
    }
  })
  const planned = new Set(keptDecisions.flatMap((x) => decisionParts(x.d).copy.map((c) => c.slot)))
  for (const s of articles)
    if (!planned.has(s.slot)) fail([s.slot], 'article copy has no kept original-post decision in the plan')
  return problems
}
