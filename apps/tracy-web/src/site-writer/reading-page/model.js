// The copy reading page's model (ADR 0042): the plan, the written copy, the brief and the latest check result joined
// into what the page shows, in plan order. Pure: files in, a plain object out. Nothing is judged here; a slot is red
// only when the copy check listed a failure for it.
import { kitListsIndex } from './kit-lists.js'

const asArray = (x) => (Array.isArray(x) ? x : [])
const sum = (items) => items.reduce((n, t) => n + [...String(t)].length, 0)

/**
 * A fact value or an evidence entry as readable text: a string as it is, a list item by item ("; "), an object by
 * its text or quote when it has one, else as compact "key: value" pairs. Null when there is nothing to show.
 */
export function readableText(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    const parts = v.map(readableText).filter((x) => x !== null && x !== '')
    return parts.length ? parts.join('; ') : null
  }
  if (typeof v === 'object') {
    for (const key of ['text', 'quote']) if (typeof v[key] === 'string' && v[key].trim()) return v[key]
    const parts = Object.entries(v)
      .map(([k, x]) => [k, readableText(x)])
      .filter(([, x]) => x !== null && x !== '')
      .map(([k, x]) => `${k}: ${x}`)
    return parts.length ? parts.join(', ') : null
  }
  return null
}

/** The quotes of a fact's evidence (a string, or a list of { quote } entries); null when it holds none. */
function evidenceText(evidence) {
  if (typeof evidence === 'string') return evidence
  const quotes = asArray(evidence)
    .map((e) => (typeof e === 'string' ? e : typeof e?.quote === 'string' ? e.quote : null))
    .filter((q) => q && q.trim())
  return quotes.length ? quotes.join(' / ') : null
}

/** The failures of a check result by their "where", in rule order. */
function failureIndex(check) {
  const byWhere = new Map()
  for (const rule of asArray(check?.rules))
    for (const f of asArray(rule.failures)) {
      const list = byWhere.get(f.where) ?? []
      list.push({
        rule: rule.id,
        title: rule.title,
        cause: f.cause ?? null,
        detail: String(f.detail ?? '').replace(`${f.where}: `, '')
      })
      byWhere.set(f.where, list)
    }
  return byWhere
}

export function buildModel({
  plan,
  brief,
  copy,
  check,
  run,
  standing,
  mainMenu = null,
  footerHeadings = [],
  kit = null
}) {
  const failures = failureIndex(check)
  const placed = new Set()
  const take = (where) => {
    placed.add(where)
    return failures.get(where) ?? []
  }
  const facts = new Map(asArray(brief?.facts).map((f) => [f.id, f]))
  const factsOf = (ids) =>
    asArray(ids).map((id) => {
      const f = facts.get(id)
      return {
        id,
        field: f?.field ?? null,
        value: readableText(f?.value),
        evidence: evidenceText(f?.evidence ?? f?.quote ?? null)
      }
    })
  const written = new Map()
  for (const s of asArray(copy.slots)) if (!written.has(s.slot)) written.set(s.slot, s)
  const alts = new Map(asArray(copy.alts).map((a) => [a.frame, a.text]))
  const returns = asArray(copy.returns)
  const returned = new Map(returns.filter((r) => r.slot).map((r) => [r.slot, r.reason]))
  const shown = new Set()
  const keptDecisions = [
    ...asArray(plan.sharedBlocks),
    ...asArray(plan.pages)
      .filter((p) => p.decision === 'keep')
      .flatMap((p) => asArray(p.blocks))
  ].filter((d) => d && d.decision === 'keep')
  const hiddenWhy = new Map(
    keptDecisions.flatMap((d) => asArray(d.hiddenSlots).map((h) => [h.slot, h.why ?? '']))
  )
  const kitIdx = kitListsIndex({ kit, written, hiddenWhy, returned })

  const slotView = (entry, label = null) => {
    const w = written.get(entry.slot)
    shown.add(entry.slot)
    const items = w ? (Array.isArray(w.text) ? w.text : [w.text]) : []
    const fails = take(entry.slot)
    const limitText = fails.map((f) => /limit (\d+)/.exec(f.detail)?.[1]).find(Boolean)
    return {
      slot: entry.slot,
      label,
      says: entry.says ?? null,
      basis: entry.basis ?? null,
      facts: factsOf(entry.factIds),
      owner: w?.owner ?? null,
      replacedPlanLabel: typeof w?.replacedPlanLabel === 'string' ? w.replacedPlanLabel : null,
      items,
      chars: sum(items),
      limit: entry.maxCharacters ?? (limitText ? Number(limitText) : null),
      written: Boolean(w),
      returnedReason: returned.get(entry.slot) ?? null,
      failures: fails
    }
  }
  const pictureView = (p) => ({
    frame: p.frame,
    kind: p.kind ?? null,
    size: p.size ?? null,
    shows: p.shows ?? null,
    alt: alts.get(p.frame) ?? null,
    failures: take(p.frame)
  })
  const blockView = (b) => {
    if (b.decision && b.decision !== 'keep')
      return {
        id: b.block,
        decision: b.decision,
        why: b.why ?? null,
        slots: [],
        pictures: [],
        hidden: [],
        links: [],
        lists: []
      }
    const headings = asArray(footerHeadings)
      .filter((h) => h.block === b.block && !asArray(b.copy).some((c) => c.slot === h.slot))
      .map((h) =>
        slotView(
          { slot: h.slot, says: h.says, maxCharacters: h.maxCharacters, factIds: [] },
          'column heading'
        )
      )
    const slots = [...headings, ...asArray(b.copy).map((c) => slotView(c))]
    const pictures = asArray(b.pictures).map(pictureView)
    for (const list of asArray(b.lists))
      asArray(list.items).forEach((item, i) => {
        const label = `${list.list} row ${i + 1}${item.about ? `: ${item.about}` : ''}`
        for (const c of asArray(item.copy)) slots.push(slotView(c, label))
        for (const p of asArray(item.pictures)) pictures.push(pictureView(p))
      })
    return {
      id: b.block,
      decision: 'keep',
      why: b.why ?? null,
      slots,
      pictures,
      hidden: asArray(b.hiddenSlots).map((h) => ({ slot: h.slot, why: h.why ?? null })),
      links: linksOf(b),
      lists: kitIdx.listsOf(b.block),
      sentences: kitIdx.sentencesOf(b.block)
    }
  }
  // The plan's links of a block, in plan order: the label from the copy (wherever its slot was written), the target
  // page, and the plan's reason when the label slot is hidden in this block.
  const linksOf = (b) => {
    const hiddenWhy = new Map(asArray(b.hiddenSlots).map((h) => [h.slot, h.why ?? '']))
    return asArray(b.links).map((l) => {
      const w = written.get(l.labelSlot)
      return {
        link: l.link ?? null,
        labelSlot: l.labelSlot ?? null,
        leadsTo: l.leadsTo ?? null,
        label: w ? (Array.isArray(w.text) ? w.text.join(' ') : w.text) : null,
        owner: w?.owner ?? null,
        hiddenWhy: hiddenWhy.has(l.labelSlot) ? hiddenWhy.get(l.labelSlot) : null
      }
    })
  }
  const seoOf = (page) => {
    const s = asArray(copy.seo).find((e) => e.page === page)
    return {
      title: s?.title ?? null,
      description: s?.description ?? null,
      titleFailures: take(`${page} (title)`),
      descriptionFailures: take(`${page} (description)`)
    }
  }
  const bodyOf = (page) => {
    const p = asArray(copy.pages).find((e) => e.page === page)
    if (!p) return null
    return {
      title: p.title,
      body: asArray(p.body).map((text, i) => ({ text, failures: take(`${page} (body ${i + 1})`) }))
    }
  }

  const sharedBlocks = asArray(plan.sharedBlocks).map(blockView)
  const pages = asArray(plan.pages).map((p) => ({
    id: p.id,
    decision: p.decision,
    why: p.why ?? null,
    blocks: p.decision === 'keep' ? asArray(p.blocks).map(blockView) : [],
    seo: p.decision === 'keep' ? seoOf(p.id) : null
  }))
  for (const p of pages) if (p.seo) p.failures = take(p.id)
  const legal = asArray(plan.site?.legalPages).map((l) => ({
    id: l.id,
    kind: l.kind,
    says: l.says ?? null,
    slug: l.slug ?? null,
    seo: seoOf(l.id),
    page: bodyOf(l.id),
    failures: take(l.id)
  }))
  const notFound = {
    says: plan.site?.notFound?.says ?? null,
    page: bodyOf('notFound'),
    failures: take('notFound')
  }
  const menu = mainMenu ? menuView(mainMenu, slotView) : null
  const strays = [...written.values()]
    .filter((s) => !shown.has(s.slot))
    .map((s) => slotView({ slot: s.slot, factIds: s.factIds }, 'not a slot of the plan blocks'))
  const fixedUp = new Set([...failures.keys()].filter((k) => !placed.has(k)))
  const unplaced = [...fixedUp].flatMap((k) => failures.get(k).map((f) => ({ where: k, ...f })))
  const allSlots = [...sharedBlocks, ...pages.flatMap((p) => p.blocks)]
    .flatMap((b) => b.slots)
    .concat(menu?.slots ?? [], strays)

  return {
    run: run ?? null,
    kit: copy.fingerprint?.kit ?? plan.kit ?? null,
    language: plan.site?.language ?? null,
    checker: check?.meta?.checker ?? null,
    summary: check?.summary ?? null,
    counts: {
      slots: allSlots.length,
      failing: allSlots.filter((s) => s.failures.length || (!s.written && !s.returnedReason)).length,
      returns: returns.length,
      failures: [...failures.values()].reduce((n, l) => n + l.length, 0)
    },
    sharedBlocks,
    mainMenu: menu,
    // Null without the kit: the page cannot tell which kit slots the copy leaves alone.
    unhandled: kitIdx.available ? kitIdx.unhandled([...new Set(keptDecisions.map((d) => d.block))]) : null,
    pages,
    legal,
    notFound,
    strays,
    notebook: asArray(copy.notebook),
    returns,
    standing: String(standing ?? '')
      .split('\n')
      .filter(Boolean),
    unplaced
  }
}

// The main menu of the mapping export: each item with its depth, and a slot card for every dropdown label the writer
// writes (so its failures sit on it, not among the strays).
function menuView(mainMenu, slotView) {
  const items = asArray(mainMenu.items)
  const byItem = new Map(items.map((i) => [i.item, i]))
  const depthOf = (i) => (i.parent && byItem.has(i.parent) ? 1 + depthOf(byItem.get(i.parent)) : 0)
  const labelOf = (item) => item?.label ?? item?.demo ?? item?.path ?? ''
  return {
    items: items.map((i) => ({ ...i, depth: depthOf(i) })),
    slots: items
      .filter((i) => i.writer)
      .map((i) =>
        slotView(
          { slot: i.slot, says: i.intent ?? null, maxCharacters: i.maxCharacters ?? null, factIds: [] },
          `dropdown under ${labelOf(byItem.get(i.parent))}`
        )
      ),
    problems: asArray(mainMenu.problems)
  }
}
