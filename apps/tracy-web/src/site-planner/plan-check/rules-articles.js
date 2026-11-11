// Article copy describes an original owner post, never a service turned into invented news (#545).
import { arr, obj, str } from './rule-set.js'

export function checkR25({ R, facts, blockIx, slotRole, slotRow, keptDecisions, decisionParts, W }) {
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
